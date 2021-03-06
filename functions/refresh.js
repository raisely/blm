const _ = require('lodash');
const { default: PQueue } = require('p-queue');
const pMap = require('p-map');
const { LogoScrape } = require("logo-scrape")
const { GoogleSpreadsheet } = require('google-spreadsheet');
const axios = require('axios');
const moment = require('moment');
const isImage = require('is-image-fast');

/**
 * Cloud function to update links for YouHaveOur.Support
 *
 * Fetches links that have been compiled from community sources
 * into a main spreadsheet
 */

// Google spreadsheet with additional info and overrides from
// the community sourced sheets
const META_SHEET = process.env.META_SHEET;

// Only allowed CORS from our domain
const allowedOrigins = ['.raisely.com', 'youhaveour.support'];

const spreadsheets = [{
	country: 'AU',
	documentKey: '1uhPa_kUCZXcoxJKwPAkKG6XJtER1QH6ZYpJk2EkhZq4',
	sheetTitle: 'AUS',
	keyMap: {
		title: 'title',
		description: 'description',
		donateUrl: 'donateUrl',
		logo: 'logo',
	},
}, {
	country: 'CA',
	documentKey: '1uhPa_kUCZXcoxJKwPAkKG6XJtER1QH6ZYpJk2EkhZq4',
	sheetTitle: 'CAN',
	keyMap: {
		title: 'title',
		description: 'description',
		donateUrl: 'donateUrl',
		logo: 'logo',
	},
}, {
	country: 'US',
	documentKey: '1uhPa_kUCZXcoxJKwPAkKG6XJtER1QH6ZYpJk2EkhZq4',
	sheetTitle: 'USA',
	keyMap: {
		title: 'title',
		description: 'description',
		donateUrl: 'donateUrl',
		logo: 'logo',
	},
}, {
	country: 'AU',
	documentKey: '1kpse8wqYdjmPrtJPLWnT4RPKVK_-bmQfVP_xDg0d3g4',
	keyMap: {
		title: 'Organisation',
		description: 'Info',
		donateUrl: 'Link',
	},
}, {
	country: 'US',
	documentKey: '1p7QxOvtvRfHUoMWib8coGHSS8szENXzSjIZKpvp-gtA',
	sheetTitle: 'ACCESSIBLE VERSION',
	keyMap: {
		title: 'Org/Individual',
		donateUrl: 'Link',
		state: 'Location (State)'
	},
}, {
	country: 'UK',
	documentKey: '1mZu6UAxnanWUMHGz3m6zgsFSEQE3IXG8AfuGxV_PuTM',
	keyMap: {
		title: 'ORGANISATIONS',
		donateUrl: 'LINKS',
		description: 'WHAT THEY DO'
	}
}, {
	country: 'US',
	documentKey: '1SRl1HOoBC_RSI4X8e_O8W9yI-7E7WJfJgYpa3UAUY-o',
	keyMap: {
		title: 'Name',
		donateUrl: 'Website',
		state: 'State',
		city: 'City',
	}
}];

// Prevent concurrent updates
let updatePromise;

/**
 * Cloud Function entry point
 *
 * @param {!Object} req Cloud Function request context.
 * @param {!Object} res Cloud Function response context.
 */
exports.integration = async function integration(req, res) {
	// CORS so custom events can also be sent from the browser
	res.set('Access-Control-Allow-Methods', 'POST,GET,HEAD,OPTIONS');
	res.set(
		'Access-Control-Allow-Headers',
		'Access-Control-Allow-Headers, Authorization, Origin, Accept, X-Requested-With, Content-Type, Access-Control-Request-Method, Access-Control-Request-Headers'
	);
	// only allow CORS from specific hosts
	let allowedOrigin = allowedOrigins[0];
	if (req.headers.origin && allowedOrigins.find(origin => req.headers.origin.endsWith(origin))) {
		allowedOrigin = req.headers.origin;
	}
	res.set('Access-Control-Allow-Origin', allowedOrigin);
	res.set('Access-Control-Allow-Credentials', true);
	res.set('Access-Control-Max-Age', '86400');

	const method = req.method.toLowerCase();

	// If it's an options request, end here
	if (method === 'options') {
		res.status(204).send();
		return true;
	}

	return doGet(req, res);
};

/**
 * Handle get requests, loads the cached or fetched links and places them in the response
 * @param {*} req
 * @param {*} res
 */
async function doGet(req, res) {
	if (updatePromise) {
		console.log('Update already in progress, exiting')
		return res.status(200).send({
			message: 'Update already in progress',
		});
	}
	updatePromise = updateMain(req.query.force);
	try {
		await updatePromise;
	} catch (error) {
		console.error(error);
		res.status(500).send({
			message: error.message,
		})
	} finally {
		// Always clear the promise so it can run again
		updatePromise = null;
	}

	res.status(200).send({
		message: 'Update completed',
	});
	return true;
}


/**
 * Update the main spreadsheet from primary sources
 * @param {GoogleSpreadsheet} metaDocument
 */
async function updateMain(force) {
	const metaDocument = await loadGoogleSpreadsheet(META_SHEET);
	const aboutSheet = await loadSheet({ document: metaDocument, sheetTitle: 'About' });
	await aboutSheet.loadCells('A20:B20');

	if (!force) {
		const lastUpdatedCell = aboutSheet.getCellByA1('B20');
		const nextUpdate = moment(lastUpdatedCell.value).add(30, 'minutes');
		const now = moment();
		if (now.isBefore(nextUpdate)) {
			console.log('Update not due yet, aborting');
			return;
		}
	} else {
		console.log('Update forced');
	}

	// Arrange sources by country so we can do
	// each country sheet without potential concurrent rewrite to the sheet
	const sourcesByCountry = {};
	spreadsheets.forEach(sheet => {
		if (sourcesByCountry[sheet.country]) {
			sourcesByCountry[sheet.country].push(sheet);
		} else {
			sourcesByCountry[sheet.country] = [sheet];
		}
	});

	await pMap(
		Object.keys(sourcesByCountry),
		country => updateCountry(country, sourcesByCountry[country]),
		// Don't run parallelt as each spreadsheet involves loading a lot of rows into memory
		// and we haven't a lot of memory allocated to the function
		{ concurrency: 1 }
	);

	console.log('Finished main spreadsheet update');

	// Set the date updated
	const lastUpdatedCell = aboutSheet.getCellByA1('B20');
	lastUpdatedCell.value = new Date().toISOString();
	await aboutSheet.saveUpdatedCells();
}

/**
 * Update a country worksheet in the main sheet
 * Goes through each of the sources for that country and
 * * Adds missing rows
 * * Clears the source column if the row is no longer in the source sheet
 * * Tries to find a logo if one is missing (or twitter is requested)
 *
 * @param {string} country Country code to work on (eg UK, AU)
 * @param {object[]} sources Source for this country
 * @param {GoogleSpreadsheet} metaDocument The previously loaded main spreadsheet
 */
async function updateCountry(country, sources) {
	// Load each country sheet separately so GC can clean up that sheet
	// once we're done updating it
	let countrySheet = await loadSheet({ documentKey: META_SHEET, sheetTitle: country });
	let countryRows = await countrySheet.getRows();

	// To keep promises managable
	const queue = new PQueue({ concurrency: 3 });
	const enqueue = fn => queue.add(() => fn().catch(console.error));

	await pMap(sources, async (source, index) => {
		const sourceUrl = `https://docs.google.com/spreadsheets/d/${source.documentKey}/edit#gid=854958934`;
		console.log(`Processing source sheet ${index + 1} for country ${country}: ${sourceUrl}`);

		let rows = await loadSourceRows(source);

		// Get all the rows that were from this source
		// then subtract from the list as we iterate over the rows in the source
		// leaving only rows that used to be in the source, but aren't any
		// more
		let toDelete = countryRows.filter(r => r.source === sourceUrl);

		let rowsWithoutLogos = [];
		let updated = 0;

		let toInsert = [];
		// Find rows that need to be inserted
		// Find rows to be hidden
		rows.forEach(row => {
			const existingRow = countryRows.find(r => r.donateUrl === row.donateUrl);
			if (existingRow) {
				// If the row is unclaimed by a source, add a reference to this source
				if (!existingRow.source) {
					existingRow.source = sourceUrl;
					updated += 1;
					enqueue(() => {
						console.log(`Updating row ${existingRow.donateUrl}`);
						return existingRow.save()
					});
				}
				// This row is current, so don't delete it
				_.pull(toDelete, existingRow);

				// Add logo if it's missing or twitter is requested
				if (!existingRow.logo || existingRow.logo.toLowerCase() === 'twitter') rowsWithoutLogos.push(existingRow);
			} else {
				row.source = sourceUrl;
				toInsert.push(row);
			}
		});
		if (updated) console.log(`Updating ${updated} rows`);
		enqueue(async () => {
			if (toInsert.length) {
				console.log(`Inserting ${toInsert.length} rows`);
				const newRows = await countrySheet.addRows(toInsert);
				// All new rows will need logos fetched
				rowsWithoutLogos = rowsWithoutLogos.concat(newRows);
			}
		});
		// We need to let all promises resolve so that all new rows are inserted
		// before we go on to update any logos
		await queue.onEmpty();
		// Kick off the logo fetch, but don't await it, we can move on to the next
		// source while logos are being fetched as that will affect different rows
		if (rowsWithoutLogos.length) enqueue(() => updateLogos(countrySheet, rowsWithoutLogos));
		if (toDelete.length) {
			console.log(`Hiding ${toDelete.length} rows that are no longer in the source sheet`);
			toDelete.forEach(row => {
				row.source = '';
				enqueue(() => row.save());
			});
		}
		rows = null;
		toDelete = null;
		toInsert = null;
		rowsWithoutLogos = null;
	}, { concurrency: 1 });

	// Wait for the queue to fully drain
	// (ie any remaining logo fetches)
	await queue.onEmpty();

	// Null the sheet to tip off the Garbage Collector to clean it up
	// so we don't get an out of memory error
	// https://stackoverflow.com/questions/62461275/any-way-to-hint-force-garbage-collection-on-node-google-cloud-function
	countrySheet = null;
	countryRows = null;
}

/**
 * Load the rows from a source spreadsheet
 * NOTE this doesn't return a SpreadsheetRow as we have to work cell by cell
 * on community spreadsheets
 * @param {object} sheetDescription
 * @reutrns {Promise<object[]>}
 */
async function loadSourceRows(sheetDescription) {
	const { documentKey, sheetTitle } = sheetDescription;
	let sheet = await loadSheet({ documentKey, sheetTitle })

	// The getRows approach assumes the first row is the header
	// many of the community spreadsheets have information prior to the header row
	// so we need to work cell by cell to find the header row and the info rows below
	await sheet.loadCells();

	let rowIndex = 0;
	const headerMap = {};
	_.forEach(sheetDescription.keyMap, (theirKey, ourKey) => headerMap[ourKey] = { key: theirKey });

	// Find the header row
	do {
		if (rowIndex > sheet.rowCount) {
			throw new Error('Could not find header rows in spreadsheet');
		}
		const row = getRowFromCells(sheet, rowIndex, sheet.columnCount);
		Object.values(headerMap).forEach(header => {
			const headerIndex = row.findIndex(h => h === header.key);
			if (headerIndex !== -1) header.index = headerIndex;
		});
		rowIndex += 1;
	} while (!headerMap.donateUrl.index);

	const rows = [];
	do {
		const rowAsObject = {};
		_.forEach(headerMap, ({ index }, key) => rowAsObject[key] = sheet.getCell(rowIndex, index).value);

		// No point adding rows not containing a url
		if (rowAsObject.donateUrl) {
			// Sheets sometime capitalises the first letter (eg Http://)
			// which causes problems for the scraper
			const replacer = /^http[s]?:\/\//i;
			rowAsObject.donateUrl = rowAsObject.donateUrl.replace(replacer, m => m.toLowerCase());

			// No point adding rows without valid urls
			const validUrl = rowAsObject.donateUrl.startsWith('http://') || rowAsObject.donateUrl.startsWith('https://')
			if (validUrl) rows.push(rowAsObject);
		}
		rowIndex += 1;
	} while (rowIndex < sheet.rowCount);

	sheet = null;

	return rows;
}

/**
 * Get a row as an array of cell values
 * @param {GoogleWorksheet} sheet
 * @param {integer} rowIndex
 * @param {integer} width
 * @returns {string[]}
 */
function getRowFromCells(sheet, rowIndex, width) {
	const row = [];
	for (let i = 0; i < width; i++) {
		row[i] = sheet.getCell(rowIndex, i).value;
	}
	return row;
}

/**
 * Load a google spreadsheet document
 * @param {string} sheetKey Key of the document
 */
async function loadGoogleSpreadsheet(sheetKey) {
	// spreadsheet key is the long id in the sheets URL
	const doc = new GoogleSpreadsheet(sheetKey);

	let credentials;
	if (process.env.GOOGLE_CREDENTIALS_JSON) {
		const jsonCreds = JSON.parse(process.env.GOOGLE_CREDENTIALS_JSON);
		credentials = _.pick(jsonCreds, ['client_email', 'private_key']);
	} else {
		credentials = {
			// use service account creds
			client_email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
			private_key: process.env.GOOGLE_PRIVATE_KEY,
		};
	}
	await doc.useServiceAccountAuth(credentials);

	// loads document properties and worksheets
	await doc.loadInfo();

	return doc;
}

/**
 * Load a GoogleWorksheet from a GoogleSpreadsheet
 * Can either load from an already loaded document, or can load
 * the spreadsheet by given documentKey
 * @param {*} opts
 * @param {string} opts.documentKey Key of a GoogleSpreadsheet to load
 * @param {GoogleSpreadsheet} opts.document An already loaded document
 * @param {string} sheetTitle Title of the worksheet to load, returns the first sheet if not specified
 */
async function loadSheet({ documentKey, document, sheetTitle }) {
	let doc = document || await loadGoogleSpreadsheet(documentKey);

	const sheet = sheetTitle ? doc.sheetsByIndex.find(s => s.title === sheetTitle) : doc.sheetsByIndex[0];

	doc = null;
	return sheet;
}

/**
 * Attempt to find a logo for the given row
 * Uses LogoScrape to find a logo
 * If that fails, (or if the row.logo === 'twitter') scans the page for
 * twitter.com/<username> to find a twitter username and uses the twitter avatar
 *
 * If a logo is found, the row.logo is set to the url
 * If not logo is found, row.logo is set to '(none)'
 * Will save the row
 * @param {GoogleSpreadsheetRow} row
 */
async function getLogo(row) {
	try {
		let logo;
		// Allow users to request fetching the twitter logo by writting
		// twitter in the meta document
		if (_.get(row, 'logo', '').toLowerCase() !== 'twitter') {
			const scrapedLogo = await LogoScrape.getLogo(row.donateUrl)

			logo = _.get(scrapedLogo, 'url', null);
			if (logo && logo.endsWith('.ico')) logo = null;
		}
		if (!logo) {
			const twitterLogo = await scrapeTwitterLogo(row);
			if (twitterLogo) logo = twitterLogo;
		}
		row.logo = logo || '(none)';
		if (row.logo !== '(none)') {
			console.log(`Found logo: ${row.logo}`);
			const linkWorks = isImage(row.logo);
			if (!linkWorks) row.logo = '(none)';
		}
		await row.save();
	} catch (e) {
		console.error(e);
		row.logo = '(none)';
		// If the save fails it's most likely a quota error
		// don't let that bubble up
		await row.save().catch(console.error);
	}
}

/**
 * Attempt to find a twitter logo for a page
 * Loads the body of the page and searches for twitter.com/<username>
 * @param {GoogleSpreadsheetRow} row
 * @return {string} The avatar url or null
 */
async function scrapeTwitterLogo(row) {
	const response = await axios(row.donateUrl);
	const body = response.data;

	const matcher = /twitter\.com\/([A-Za-z0-9]+)[/?#"']/g;
	// Don't logos from these twitter accounts
	const reservedWords = ['intent', 'about', 'me', 'signup', 'gofundme'];

	let match;
	do {
		match = matcher.exec(body);
		// Keep searching until we run out of matches, or
	} while (match && reservedWords.includes(match[1]));

	if (match) return `https://twitter-avatar.now.sh/${match[1]}`;
	return null;
}

/**
 * Update the logos for the given rows
 * (batches the updates)
 * @param {object} sheetDescription
 * @param {GoogleSpreadsheetRow[]} rowsWithoutLogos
 */
async function updateLogos(sheetDescription, rowsWithoutLogos) {
	console.log(`Updating logos for ${rowsWithoutLogos.length} rows`);
	// Fetch logo's 5 at a time
	return pMap(rowsWithoutLogos, getLogo, { concurrency: 4 });
}

