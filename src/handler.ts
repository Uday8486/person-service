import awsLambdaFastify from '@fastify/aws-lambda';
import fastify, { FastifyReply } from 'fastify';
import { metrics, logger } from './utils/observability';
import { PersonService } from './services/person.service';
import { PersonController } from './controllers/person.controller';
import { getErrorResponse } from './utils/error-handling';

export const app = fastify({ logger: false });

const personService = new PersonService();
const personController = new PersonController(personService);

const personSchema = {
    type: 'object',
    required: ['firstName', 'lastName', 'phoneNumber', 'address'],
    properties: {
        firstName: { type: 'string', minLength: 1 },
        lastName: { type: 'string', minLength: 1 },
        phoneNumber: { type: 'string', minLength: 10 },
        address: { type: 'string', minLength: 5 },
    },
};

const personCreateResponseSchema = {
    type: 'object',
    required: ['firstName', 'lastName', 'phoneNumber', 'address', 'id'],
    properties: {
        firstName: { type: 'string' },
        lastName: { type: 'string' },
        phoneNumber: { type: 'string' },
        address: { type: 'string' },
        id: { type: 'string' },
    }
};

const querySchema = {
    type: 'object',
    additionalProperties: false,
    properties: {
        limit: { type: 'integer', minimum: 1, maximum: 100, default: 30 },
        cursor: { type: 'string' },
    },
};

const listResponseSchema = {
    type: 'object',
    required: ['items', 'count'],
    properties: {
        items: {
            type: 'array',
            items: personCreateResponseSchema
        },
        nextCursor: {
            type: ['string', 'null']
        },
        count: { type: 'integer' }
    }
};


app.addHook('onResponse', async () => {
    metrics.publishStoredMetrics();
});

app.setErrorHandler((error: unknown, _request, reply: FastifyReply) => {
    const { statusCode, message } = getErrorResponse(error);
    if (statusCode >= 500) logger.error('Unhandled internal error', { err: error });
    reply.status(statusCode).send({ error: message });
});

app.post('/person', {
    schema: {
        body: personSchema,
        response: {
            201: personCreateResponseSchema,
        }
    },
}, personController.createPerson);

app.get('/person', {
    schema: {
        querystring: querySchema,
        response: {
            200: listResponseSchema,
        }
    },
}, personController.getPersons);

export const handler = awsLambdaFastify(app);
