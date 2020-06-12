const chai = require('chai');
const { integration } = require('./refresh');

const { expect } = chai;

// Don't run this test by default as it uses up quota
// TODO nock the google sheets for this test
describe.skip('Update main sheet', () => {
	let req;
	let res;
	let result;

	before(() => {
		const testCredentials = require('./test-service-account.json');
		process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL = testCredentials.client_email;
		process.env.GOOGLE_PRIVATE_KEY = testCredentials.private_key;
	});

	describe('GET', () => {
		describe('Conduct refresh', () => {
			before(async function beforeFirst() {
				({ req, res } = prepare());

				try {
					result = await integration(req, res);
					return result;
				} catch (e) {
					console.error(e);
					throw e;
				}
			});
			itSucceeds();
		});
	});

	/**
	 * Verify that the cloud function returns status 200 and a body of
	 * { success: true }
	 */
	function itSucceeds() {
		it('has good result', () => {
			expect(result).to.eq(true);
			expect(res.statusCode).to.eq(200);
		});
	}
});

/**
 * Prepare a mock request to test the cloud function with
 * @param {*} body
 */
function prepare(reqOptions) {
	const req = {
		method: 'get',
		query: {},
		headers: {},
		...reqOptions,
	};
	const res = {};
	res.status = (code) => {
		res.statusCode = code;
		return res.status;
	};
	res.set = (key, val) => {
		if (!res.headers) res.headers = {};
		res.headers[key] = val;
	}
	res.status.send = (response) => (res.body = response);

	return { req, res };
}
