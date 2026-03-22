import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mockClient } from 'aws-sdk-client-mock';
import {
  DynamoDBDocumentClient,
  PutCommand,
} from '@aws-sdk/lib-dynamodb';
import { SNSClient, PublishCommand } from '@aws-sdk/client-sns';
import { PersonService } from '../../src/services/person.service';
import { Person } from '../../src/models/person';



const ddbMock = mockClient(DynamoDBDocumentClient);
const snsMock = mockClient(SNSClient);

vi.mock('@aws-lambda-powertools/logger', () => ({
  Logger: class {
    info = vi.fn();
    error = vi.fn();
    warn = vi.fn();
    debug = vi.fn();
  },
}));

vi.mock('@aws-lambda-powertools/metrics', () => ({
  Metrics: class {
    addMetric = vi.fn();
    publishStoredMetrics = vi.fn();
  },
  MetricUnit: {
    Count: 'Count',
  },
}));

vi.mock('@aws-lambda-powertools/tracer', () => ({
  Tracer: class {
    captureAWSv3Client = vi.fn((client) => client);
    putAnnotation = vi.fn();
  },
}));

describe('PersonService', () => {
  let personService: PersonService;

  beforeEach(() => {
    process.env.TOPIC_ARN = 'arn:aws:sns:us-east-1:123456789012:MyTopic';
    ddbMock.reset();
    snsMock.reset();
    personService = new PersonService();
  });

  afterEach(() => {
    delete process.env.TOPIC_ARN;
    vi.clearAllMocks();
  });

  it('should create a person with a UUID, raw phone, and publish an event', async () => {
    const inputPhone = '123-456 7890';
    const inputPerson: Person = {
      firstName: 'John',
      lastName: 'Doe',
      phoneNumber: inputPhone,
      address: '123 Main St',
    };

    ddbMock.on(PutCommand).resolves({});
    snsMock.on(PublishCommand).resolves({});

    const result = await personService.createPerson(inputPerson);

    // Verify properties
    expect(result.id).toBeDefined();
    expect(result.firstName).toBe('John');

    // Verify phone is preserved exactly as input (No Normalization)
    expect(result.phoneNumber).toBe(inputPhone);

    // Verify DB Call (1 PutCommand)
    const ddbCalls = ddbMock.commandCalls(PutCommand);
    expect(ddbCalls.length).toBe(1);
    const putItem = ddbCalls[0].args[0].input.Item as any;
    expect(putItem.PK).toBe(`PERSON#${result.id}`);

    // Verify SNS call
    const snsCalls = snsMock.commandCalls(PublishCommand);
    expect(snsCalls.length).toBe(1);
  });

  it('should throw an error if DynamoDB fails to create a person', async () => {
    const inputPerson: Person = {
      firstName: 'John',
      lastName: 'Doe',
      phoneNumber: '1234567890',
      address: '123 Main St',
    };

    ddbMock.on(PutCommand).rejects(new Error('DynamoDB Error'));

    await expect(personService.createPerson(inputPerson)).rejects.toThrow('DynamoDB Error');
  });

  it('should return the person even if SNS publishing fails (partial success)', async () => {
    const inputPerson: Person = {
      firstName: 'John',
      lastName: 'Doe',
      phoneNumber: '1234567890',
      address: '123 Main St',
    };

    ddbMock.on(PutCommand).resolves({});
    snsMock.on(PublishCommand).rejects(new Error('SNS Error'));

    const result = await personService.createPerson(inputPerson);

    expect(result).toBeDefined();
    expect(result.firstName).toBe('John');
  });
});
