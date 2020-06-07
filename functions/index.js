const _ = require('lodash');
const pMap = require('p-map');
const { LogoScrape } = require("logo-scrape")
const { GoogleSpreadsheet } = require('google-spreadsheet');

// Google spreadsheet with additional info and overrides from
// the community sourced sheets
const META_SHEET = process.env.META_SHEET;

// Only allowed CORS from our domain
const allowedOrigins = ['.raisely.com'];

const spreadsheets = [{
	country: 'AU',
	documentKey: '1kpse8wqYdjmPrtJPLWnT4RPKVK_-bmQfVP_xDg0d3g4',
	keyMap: {
		title: 'Organisation',
		description: 'Info',
		donateUrl: 'Link',
	},
}];

// Used as a lock to ensure only one thread is getching the spreadsheet
// this ensures only one update is sent per thread instance, and means
// requests coming in during the inital request can respond faster
let getRowsPromise;

// Updating logos will be slow
// this promise get's fired if at least one logo needs updating
// but we won't wait for it as it'll keep the client waiting too long
// instead we'll use the presence of this promise to set no-cache header
let updateLogoPromises;

/**
 * Example Cloud Function that catches webhooks from Raisely
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
	};

	if (updateLogoPromises) {
		// FIXME add caching header
	}

	res.status(200).send(response);
	return true;
}

async function loadAllCountries() {
	const results = {};
	try {
		await Promise.all(spreadsheets.map(async sheetDescription => {
			console.log(`Loading from source sheet for country ${sheetDescription.country}`);
			const rows = await loadSheetRows(sheetDescription);

			// Merge with any meta info we've noted and add logos
			console.log(`Merging in meta info from for country ${sheetDescription.country}`);
			const mergedRows = await mergeMetaRows(sheetDescription, rows);
			results[sheetDescription.country] = mergedRows;
		}));
	} finally {
		// If a logo update was started, create a promise to clean up when it's done
		if (updateLogoPromises) finaliseLogoPromises();
	}
	return results;
}

async function loadSheetRows(sheetDescription) {
	const { documentKey, sheetTitle } = sheetDescription;
	const sheet = await getSheet(documentKey, sheetTitle);

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
		if (rowAsObject.donateUrl) rows.push(rowAsObject);
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

async function getSheet(sheetKey, sheetTitle) {
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
		const sheet = sheetTitle ? doc.sheetsByIndex.find(sheet => sheet.title === sheetTitle) : doc.sheetsByIndex[0];

		return sheet;
}

async function mergeMetaRows(sheetDescription, rows) {
	const metaSheet = await getSheet(META_SHEET, sheetDescription.country);

	const mergedRows = [];
	const newMetaRows = [];

	const metaRows = await metaSheet.getRows();
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
		const logo = await LogoScrape.getLogo(row.donateUrl)
		row.logo = _.get(logo, 'url', '(none)');
		await row.save();
	} catch (e) {
		console.error(e);
	}
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
