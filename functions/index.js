const _ = require('lodash');
const dayjs = require('dayjs');
const customParseFormat = require('dayjs/plugin/customParseFormat')
const { GoogleSpreadsheet } = require('google-spreadsheet');
const cache = require('nano-cache');

dayjs.extend(customParseFormat);

// Shared secret. Will prevent basic scrapers (won't stop people
// from extracting the shared key from the Javascript that calls it)
const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET;

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
	const allowedOrigin = allowedOrigins.find(origin => req.headers.origin.endsWith(origin)) ? req.headers.origin : allowedOrigins[0];
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
	const results = {};

	spreadsheets.map(sheetDescription => {
		const rows = await loadSheetRows(sheetDescription, sheetDescription);
		results[sheetDescription.country] = await Promise.all(rows.map(async row => {
			const mappedRow = {};
			_.forEach(sheetDescription.keyMap, (oldKey, newKey) => {
				mappedRow[newKey] = row[oldKey];
			});
			// if (!mappedRow.logo) mappedRow.logo = await getLogo(donateUrl);
		}));
	});

	const response = {
		data: results,
	};

	res.status(200).send(response);
	return true;
}

async function loadSheetRows(sheetDescription) {
	const { sheetKey, sheetTitle } = sheetDescription;
	const sheet = await getSheet(sheetKey, sheetTitle);

	await sheet.loadCells();

	let rowIndex = 0;
	const headerMap = {};
	_.forEach(sheetDescription.keyMap, (theirKey, ourKey) => headerMap[ourKey] = { key: theirKey });
	let foundHeader = false;

	// Find the header row
	do {
		if (rowIndex > sheet.rowCount) {
			throw new Error('Could not find header rows in spreadsheet');
		}
		const row = getRowFromCells(sheet, rowIndex, sheet.columnCount);
		Object.values(headerMap).forEach(header => {
			const headerIndex = row.findIndex(header.key);
			if (headerIndex !== -1) header.index = headerIndex;
		});
		rowIndex += 1;
	} while (!headerMap.donateUrl.index);

	const rows = [];
	do {
		const row = getRowFromCells(sheet, rowIndex, sheet.columnCount);
		const rowAsObject = {};
		_.forEach(headerMap, ({ index }, key) => rowAsObject[key] = sheet.getCell(rowIndex, index)).value;

		// No point adding rows not containing a url
		if (rowAsObject.donateUrl) rows.push(rowAsObject);
		rowIndex += 1;
	} while (rowIndex < sheet.rowCount);

	return rows;
}

function getRowFromCells(sheet, row, width) {
	const row = [];
	for (let i=0; i < sheet.width; i++) {
		row[i] = sheet.getCell(row, i).value;
	}
	return row;
}

async function getSheet(sheetKey, sheetTitle) {
		// spreadsheet key is the long id in the sheets URL
		const doc = new GoogleSpreadsheet(process.env.SHEET_KEY);

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
		const sheet = sheetName ? doc.sheetsByIndex.find(sheet => sheet.title === sheetTitle) : doc.sheetsByIndex[0];

		return sheet;
}
