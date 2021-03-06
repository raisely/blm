const chai = require('chai');
const { integration } = require('./lookup');

const { expect } = chai;
const cache = require('nano-cache');

describe('Lookup main sheet', () => {
	let req;
	let res;
	let result;

	before(() => {
		const testCredentials = require('./test-service-account.json');
		process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL = testCredentials.client_email;
		process.env.GOOGLE_PRIVATE_KEY = testCredentials.private_key;
	});

	describe('GET', () => {
		describe('Load links', () => {
			before(async function beforeFirst() {
				cache.clear();
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
			itReturnsRows();
			itCanSerialise();
		});

		describe('Load from cache', () => {
			before(async function beforeSecond() {
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
			it('refresh is false', () => {
				expect(res.body.refresh).to.be.false;
			});
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
	function itReturnsRows() {
		it('returns rows', () => {
			console.log(res.body);
			expect(Object.keys(res.body.data)).to.include('AU');
		});
	}
	function itCanSerialise() {
		it('can serialise' , () => {
			JSON.stringify(res.body);
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
