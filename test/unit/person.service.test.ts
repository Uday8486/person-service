import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mockClient } from 'aws-sdk-client-mock';
import {
  DynamoDBDocumentClient,
  PutCommand,
  QueryCommand
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


  it('should list persons with default limits (30)', async () => {
    ddbMock.on(QueryCommand).resolves({ Items: [] });
    await personService.getPersons();

    const callArgs = ddbMock.commandCalls(QueryCommand)[0].args[0].input as any;
    expect(callArgs.Limit).toBe(30);
  });

  it('should constrain limits to max 100', async () => {
    ddbMock.on(QueryCommand).resolves({ Items: [] });
    await personService.getPersons(200);

    const callArgs = ddbMock.commandCalls(QueryCommand)[0].args[0].input as any;
    expect(callArgs.Limit).toBe(100);
  });

  it('should decode a valid base64 cursor and set ExclusiveStartKey', async () => {
    const lastKey = { PK: 'PERSON#1', SK: 'PROFILE' };
    const cursor = Buffer.from(JSON.stringify(lastKey)).toString('base64');

    ddbMock.on(QueryCommand).resolves({ Items: [], LastEvaluatedKey: lastKey });

    await personService.getPersons(10, cursor);

    const callArgs = ddbMock.commandCalls(QueryCommand)[0].args[0].input as any;
    expect(callArgs.ExclusiveStartKey).toEqual(lastKey);
  });

  it('should list persons and remove internal keys (PK, SK, GSI1PK, GSI1SK)', async () => {
    const mockItems = [
      {
        PK: 'PERSON#1',
        SK: 'PROFILE',
        GSI1PK: 'TYPE#PERSON',
        GSI1SK: 'Doe#John#1',
        id: '1',
        firstName: 'John',
        lastName: 'Doe',
        phoneNumber: '1234567890',
        address: '123 Main St'
      }
    ];
    ddbMock.on(QueryCommand).resolves({ Items: mockItems });
    const result = await personService.getPersons();

    expect(result.items.length).toBe(1);
    expect(result.items[0]).not.toHaveProperty('PK');
    expect(result.items[0]).not.toHaveProperty('SK');
    expect(result.items[0]).not.toHaveProperty('GSI1PK');
    expect(result.items[0]).not.toHaveProperty('GSI1SK');
    expect(result.items[0].firstName).toBe('John');
  });

  it('should return nextCursor if LastEvaluatedKey is present', async () => {
    const lastKey = { PK: 'PERSON#1', SK: 'PROFILE' };
    ddbMock.on(QueryCommand).resolves({ Items: [], LastEvaluatedKey: lastKey });
    const result = await personService.getPersons();

    const expectedCursor = Buffer.from(JSON.stringify(lastKey)).toString('base64');
    expect(result.nextCursor).toBe(expectedCursor);
  });

  it('should throw an error for an invalid cursor format (not base64 or invalid JSON)', async () => {
    const invalidCursor = 'not-base64-json';
    await expect(personService.getPersons(10, invalidCursor)).rejects.toThrow('Invalid cursor format');
    
    const invalidJsonCursor = Buffer.from('not-json').toString('base64');
    await expect(personService.getPersons(10, invalidJsonCursor)).rejects.toThrow('Invalid cursor format');
  });

  it('should cap limit to minimum 1 if 0 is passed', async () => {
    ddbMock.on(QueryCommand).resolves({ Items: [] });
    await personService.getPersons(0);
    const callArgs = ddbMock.commandCalls(QueryCommand)[0].args[0].input as any;
    expect(callArgs.Limit).toBe(1);
  });
});
