import awsLambdaFastify from '@fastify/aws-lambda';
import fastify from 'fastify';
import { Metrics } from '@aws-lambda-powertools/metrics';
import { PersonService } from './services/person.service';
import { PersonController } from './controllers/person.controller';


const app = fastify({ logger: true });
const metrics = new Metrics();

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

app.addHook('onResponse', async () => {
    metrics.publishStoredMetrics();
});

app.post('/person', {
    schema: {
        body: personSchema,
        response: {
            201: personCreateResponseSchema,
        }
    },
}, personController.createPerson);


export const handler = awsLambdaFastify(app);
