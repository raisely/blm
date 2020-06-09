const _ = require('lodash');
const pMap = require('p-map');
const { LogoScrape } = require("logo-scrape")
const { GoogleSpreadsheet } = require('google-spreadsheet');
const axios = require('axios');

// Google spreadsheet with additional info and overrides from
// the community sourced sheets
const META_SHEET = process.env.META_SHEET;

// Only allowed CORS from our domain
const allowedOrigins = ['.raisely.com', 'youhaveour.support'];

const spreadsheets = [{
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
}];

// Used as a lock to ensure only one thread is fetching the spreadsheet
// this ensures only one update is sent per thread instance, and means
// requests coming in during the inital request don't have to wait for
// a full fetch cycle
let getRowsPromise;

// Updating logos will be slow
// this promise get's fired if at least one logo needs updating
// but we won't wait for it as it'll keep the client waiting too long
// instead we'll use the presence of this promise to set no-cache header
let updateLogoPromises;

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

async function doGet(req, res) {
	// No need to fetch multiple times if concurrent requests are waiting
	if (!getRowsPromise) getRowsPromise = loadAllCountries();

	const results = await getRowsPromise;
	getRowsPromise = null;

	const response = {
		data: results,
		sources: spreadsheets.map(sheet => ({
			country: sheet.country,
			url: `https://docs.google.com/spreadsheets/u/0/d/${sheet.documentKey}/htmlview`,
		})),
	};

	if (updateLogoPromises) {
		// FIXME add caching header
	}

	res.status(200).send(response);
	return true;
}

async function loadAllCountries() {
	const results = {};
	const metaDocumentPromise = loadGoogleSpreadsheet(META_SHEET);
	try {
		await Promise.all(spreadsheets.map(async sheetDescription => {
			console.log(`Loading from source sheet for country ${sheetDescription.country}`);

			const { country } = sheetDescription;
			const [{ metaRows, metaSheet }, rows] = await Promise.all([
				loadCountryMetaRows(metaDocumentPromise, sheetDescription),
				loadSourceRows(sheetDescription),
			]);

			console.log(`Processing source sheet for country ${sheetDescription.country}`);

			// Merge with any meta info we've noted and add logos
			console.log(`Merging in meta info for country ${sheetDescription.country}`);
			const mergedRows = await mergeMetaRows(metaSheet, metaRows, sheetDescription, rows);
			results[country] = mergedRows;
		}));
	} finally {
		// If a logo update was started, create a promise to clean up when it's done
		if (updateLogoPromises) finaliseLogoPromises();
	}
	return results;
}

async function loadCountryMetaRows(metaDocumentPromise, sheetDescription) {
	const metaDocument = await metaDocumentPromise;
	const metaSheet = await loadSheet({ spreadsheet: metaDocument, sheetTitle: sheetDescription.country });
	const metaRows = await metaSheet.getRows();
	return { metaRows, metaSheet };
}

async function loadSourceRows(sheetDescription) {
	const { documentKey, sheetTitle } = sheetDescription;
	const sheet = await loadSheet({ documentKey, sheetTitle })

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
			const validUrl = rowAsObject.donateUrl.startsWith('http://') || rowAsObject.donateUrl.startsWith('https://')
			if (validUrl) rows.push(rowAsObject);
		}
		rowIndex += 1;
	} while (rowIndex < sheet.rowCount);

	return rows;
}

function getRowFromCells(sheet, rowIndex, width) {
	const row = [];
	for (let i=0; i < width; i++) {
		row[i] = sheet.getCell(rowIndex, i).value;
	}
	return row;
}

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

async function loadSheet({ documentKey, spreadsheet, sheetTitle }) {
	const doc = spreadsheet || await loadGoogleSpreadsheet(documentKey);

	const sheet = sheetTitle ? doc.sheetsByIndex.find(s => s.title === sheetTitle) : doc.sheetsByIndex[0];

	return sheet;
}

async function mergeMetaRows(metaSheet, metaRows, sheetDescription, rows) {
	const mergedRows = [];
	const newMetaRows = [];

	rows.forEach(row => {
		const metaRow = metaRows.find(mr => mr.donateUrl === row.donateUrl);
		let newRow;
		if (metaRow) {
			// Pick just the values, or we'll get circular referenes trying to
			// serialise
			const rawMeta = _.pickBy(metaRow, (value, key) => !(key.startsWith('_') || _.isObject(value)));
			newRow = { ...row, ...rawMeta };
		} else {
			newRow = row;
			newMetaRows.push(row);
		}
		if (!newRow.hide) mergedRows.push(newRow);
	});

	const newRows = await metaSheet.addRows(newMetaRows);

	const allMetaRows = metaRows.concat(newRows);
	const rowsWithoutLogos = allMetaRows.filter(row => !row.logo && !row.hide);
	if (rowsWithoutLogos.length) {
		if (!updateLogoPromises) updateLogoPromises = [];
		updateLogoPromises.push(updateLogos(metaSheet, rowsWithoutLogos));
	}

	// Replace any logo's that are set to (none) with null
	metaRows.forEach(row => {
		if (row.logo) {
			if (!(row.logo.startsWith('http://') || row.logo.startsWith('https://'))) {
				row.logo = null;
			}
		}
	});

	return mergedRows;
}

async function getLogo(row) {
	try {
		let logo;
		// Allow users to request fetching the twitter logo by writting
		// twitter in the meta document
		if (_.get(row, 'logo', '').toLowerCase() !== 'twitter') {
			const scrapedLogo = await LogoScrape.getLogo(row.donateUrl)

			logo = _.get(scrapedLogo, 'url', null);
			if (logo.endsWith('.ico')) logo = null;
		}
		if (!logo) {
			const twitterLogo = await scrapeTwitterLogo(row);
			if (twitterLogo) logo = twitterLogo;
		}
		row.logo = logo || '(none)';
		await row.save();
	} catch (e) {
		console.error(e);
	}
}

async function scrapeTwitterLogo(row) {
	const response = await axios(row.donateUrl);
	const body = response.data;

	const matcher = /twitter\.com\/([A-Za-z0-9]+)[/?#"']/g;
	const reservedWords = ['intent', 'about', 'me', 'signup', 'gofundme'];

	let match;
	do {
		match = matcher.exec(body);
		// Keep searching until we run out of matches, or
	} while (match && reservedWords.includes(match[1]));

	if (match) return `https://twitter-avatar.now.sh/${match[1]}`;
	return null;
}

async function updateLogos(sheetDescription, rowsWithoutLogos) {
	console.log(`Updating logos for ${rowsWithoutLogos.length} rows`);
	// Fetch logo's 5 at a time
	return pMap(rowsWithoutLogos, getLogo, { concurrency: 5 });
}

/**
 * Handler to ensure
 */
async function finaliseLogoPromises() {
	try {
		await Promise.all(updateLogoPromises)
	} catch (e) {
		console.error(e);
	} finally {
		updateLogoPromises = null;
	}
}
