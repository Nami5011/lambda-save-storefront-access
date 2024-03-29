import {
	SecretsManagerClient,
	GetSecretValueCommand,
} from "@aws-sdk/client-secrets-manager";
import mysql from 'mysql';
import beginTransaction from './beginTransaction.js';
import query from './query.js';
import commit from './commit.js';
import rollback from './rollback.js';

export const handler = async (event) => {
	if (event.httpMethod === 'OPTIONS') {
		// This is a preflight request, respond with CORS headers
		const response = {
			statusCode: 200,
			headers: {
				'Access-Control-Allow-Origin': '*',
			},
			body: JSON.stringify({ message: 'Preflight request successful' }),
		};
		return response;
	}
	console.log('==============================');
	const body = typeof event.body === 'string' ? JSON.parse(event.body) : event.body;
	const secret_name = "shopify_app";
	const client = new SecretsManagerClient({
		region: "ap-northeast-1",
	});
	var response = {
		statusCode: 200,
		headers: {
			'Access-Control-Allow-Origin': '*',
		},
		body: [],
	};
	console.log(body);
	console.log(body?.app_name);
	// Validate request data
	if (!body?.app_name || !body?.shopify_domain || !body?.storefront_key_id || !body?.storefront_key) {
		response.statusCode = 500;
		response.body = {
			errors: [{
				code: '01',
				message: 'Invalid request.',
			}]
		};
		return response;
	}

	// Get secret from Secret manager
	var secret = {};
	try {
		secret = await client.send(
			new GetSecretValueCommand({
				SecretId: secret_name,
				VersionStage: "AWSCURRENT", // VersionStage defaults to AWSCURRENT if unspecified
			})
		);
		secret = JSON.parse(secret.SecretString);
	} catch (error) {
		console.log('error!', error);
	}

	// End process if secret is unavailable
	if (!secret?.port || !secret?.username || !secret?.password) {
		response.statusCode = 500;
		response.body = {
			errors: [{
				code: '02',
				message: 'Internal error.',
			}]
		};
		return response;
	}

	const connection = mysql.createConnection({
		// host     : secret.host,
		host: 'rds-proxy-dev.proxy-cvjdm5qq5ueh.ap-northeast-1.rds.amazonaws.com',
		port: secret.port,
		// database : secret.dbname,
		database: 'shopify_app',
		user: secret.username,
		password: secret.password
	});
	// const selectSql = 'SELECT * FROM storefront_api;';
	const selectSql = `
	SELECT
		id,
		app_name,
		shopify_domain,
		storefront_key_id,
		storefront_key
	FROM
		storefront_api
	WHERE
		app_name = '${body.app_name}'
	AND
		shopify_domain = '${body.shopify_domain}'
	ORDER BY
		id
	DESC LIMIT 1;
	`;

	// Get token
	var selectResult = [];
	try {
		await beginTransaction(connection);
		selectResult = await query(connection, selectSql);
	} catch (err) {
		console.error(err);
		response.statusCode = 500;
		response.body = {
			errors: [{
				code: '03',
				message: 'Internal error.',
			}]
		};
		return response;
	}

	// End process if token exists
	if (selectResult && selectResult.length > 0 && selectResult[0]?.storefront_key_id == body.storefront_key_id) {
		console.log('token exists ', selectResult);
		response.body = selectResult;
		return response;
	}

	// Update token
	const storefront_api_id = selectResult[0]?.id;
	const updateSql = `
	UPDATE storefront_api 
	SET
		storefront_key_id = '${body.storefront_key_id}',
		storefront_key = '${body.storefront_key}'
	WHERE
		id = ${storefront_api_id};
	`;
	if (selectResult && selectResult.length > 0 && selectResult[0]?.storefront_key_id != body.storefront_key_id) {
		var updateResult = [];
		try {
			updateResult = await query(connection, updateSql);
			updateResult = await query(connection, selectSql);
			console.log('Token updated ', updateResult);
			if (updateResult && updateResult.length > 0) {
				response.body = updateResult;
			}
			await commit(connection);
		} catch(err) {
			await rollback(connection);
			console.error('Failed token update ', err);
			response.statusCode = 500;
			response.body = {
				errors: [{
					code: '04',
					message: 'Internal error.',
				}]
			};
		}
		return response;
	}


	// Save new token
	const insertSql = `
	INSERT INTO storefront_api (
		app_name,
		shopify_domain,
		storefront_key_id,
		storefront_key
	) VALUES (
		'${body.app_name}',
		'${body.shopify_domain}',
		'${body.storefront_key_id}',
		'${body.storefront_key}'
	);
	`;
	var insertResult = [];
	try {
		insertResult = await query(connection, insertSql);
		insertResult = await query(connection, selectSql);
		console.log('created ', insertResult);
		if (insertResult && insertResult.length > 0) {
			response.body = insertResult;
		}
		await commit(connection);
	} catch (err) {
		await rollback(connection);
		console.error(err);
		response.statusCode = 500;
		response.body = {
			errors: [{
				code: '05',
				message: 'Internal error.',
			}]
		};
		return response;
	}

	return response;
};
