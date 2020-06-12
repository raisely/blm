const _ = require('lodash');
const pMap = require('p-map');
const { GoogleSpreadsheet } = require('google-spreadsheet');
const cache = require('nano-cache');

/**
 * Cloud function to fetch links for YouHaveOur.Support
 *
 * Fetches links that have been compiled from community sources
 * into a main spreadsheet
 *
 * This function responds with the following JSON:
 * {
 *   sources: [{ country: 'AU', documentKey: '...' }],
 *   data: {
 *     'AU': [{ title, description, donateUrl, logo, source }],
 *   }
 * }
 *
 * The information is fetched from
 * 1. Local nano-cache, refreshed every 30 minutes from:
 * 2. Main spreadsheet
 *
 * Whenever the cache is refreshed it also kicks off a background process
 * to check all primary sources for updates and update the main spreasheet
 * and add/remove links and attempt to find an appropriate logo
 */

// Google spreadsheet with additional info and overrides from
// the community sourced sheets
const META_SHEET = process.env.META_SHEET;

// Only allowed CORS from our domain
const allowedOrigins = ['.raisely.com', 'youhaveour.support'];

// Used as a lock to ensure only one thread is fetching the spreadsheet
// whenever the cache expires. So multiple requests that come in at the
// same time can wait on the same promise for the result instead of
// sending multiple redundant requests
let getRowsPromise;

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
	// No need to fetch multiple times if concurrent requests are waiting
	let response = cache.get('response');

	// Force a fresh lookup if noCache is passed
	if (req.query.noCache) {
		console.log('noCache flagged, forcing fetch from main spreadsheet');
		response = null;
	}

	if (!response) {
		if (!getRowsPromise) {
			console.log('Loading entries from main spreadsheet');
			getRowsPromise = loadAllCountries();
		} else {
			console.log('Queuing concurrent request');
		}

		response = await getRowsPromise;
		getRowsPromise = null;

		cache.set('response', response, {
			// Cache for 30 minutes
			ttl: 30 * 60 * 1000,
		});
	}

	res.status(200).send(response);
	return true;
}

/**
 * Loads all the links for all countries from the main spreadsheets
 * Also initiates an update of the main spreadsheet from primary sources
 * @returns {object} Returns a map from country code to array of link objects
 */
async function loadAllCountries() {
	const results = {};
	const metaDocument = await loadGoogleSpreadsheet(META_SHEET);

	await pMap(metaDocument.sheetsByIndex, async (sheet) => {
		if (sheet.title === 'About') return;
		const rows = await sheet.getRows();
		const filteredRows = rows
			.filter(row => !row.hide)
			.map(row => _.pickBy(row, (value, key) => !(key.startsWith('_') || _.isObject(value))));
		// Convert rows instances to simple objects with only the values
		// (strip spreadsheet meta properties)
		results[sheet.title] = filteredRows;
	}, { concurrency: 2 });

	const sources = [];
	_.forEach(results, (rows, country) => {
		_.uniq(rows.map(r => r.source))
			.forEach(source => sources.push({
				country,
				url: source,
			}));
	});

	const response = {
		data: results,
		sources,
	};

	return response;
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
