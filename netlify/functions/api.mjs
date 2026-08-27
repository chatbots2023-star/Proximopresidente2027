import { withLambda } from '@netlify/aws-lambda-compat';
import serverless from 'serverless-http';
import { app } from '../../backend/app.js';

const lambdaHandler = serverless(app, {
  request(req, event) {
    const raw = event.path || req.url || '/';
    req.url = raw.replace(/^\/\.netlify\/functions/, '') || '/';
  },
});

export default withLambda(lambdaHandler);

export const config = {
  path: '/api/*',
};
