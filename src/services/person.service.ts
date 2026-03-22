import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  PutCommand,
  QueryCommand,
  QueryCommandInput
} from '@aws-sdk/lib-dynamodb';
import { SNSClient, PublishCommand } from '@aws-sdk/client-sns';
import { v4 as uuidv4 } from 'uuid';
import { MetricUnit } from '@aws-lambda-powertools/metrics';
import { logger, metrics, tracer } from '../utils/observability';
import { BadRequestError } from '../errors/bad-request.error';

import { PaginatedResult, Person } from '../models/person';

const dynamoClient = tracer.captureAWSv3Client(new DynamoDBClient({}));
const docClient = DynamoDBDocumentClient.from(dynamoClient);
const snsClient = tracer.captureAWSv3Client(new SNSClient({}));

export class PersonService {
  private readonly tableName: string;
  private readonly topicArn: string;

  constructor() {
    this.tableName = process.env.TABLE_NAME || 'PersonTable';
    this.topicArn = process.env.TOPIC_ARN || '';
  }

  async createPerson(person: Person): Promise<Person> {
    const id = uuidv4();

    const newPerson: Person = { ...person, id };

    const personPk = `PERSON#${id}`;
    const personSk = `PROFILE`;
    const gsi1pk = `TYPE#PERSON`;
    const gsi1sk = `${newPerson.lastName}#${newPerson.firstName}#${id}`;

    tracer.putAnnotation('personId', id);

    try {
      await docClient.send(new PutCommand({
        TableName: this.tableName,
        Item: {
          PK: personPk,
          SK: personSk,
          GSI1PK: gsi1pk,
          GSI1SK: gsi1sk,
          ...newPerson,
        },
      }));

      metrics.addMetric('PersonCreated', MetricUnit.Count, 1);

      if (this.topicArn) {
        try {
          await snsClient.send(new PublishCommand({
            TopicArn: this.topicArn,
            Message: JSON.stringify({
              eventType: 'PersonCreated',
              payload: newPerson,
            }),
          }));
        } catch (snsError) {
          metrics.addMetric('SNSPublishFailure', MetricUnit.Count, 1);
          logger.error('Failed to publish SNS event', { err: snsError, personId: id });
        }
      }

      logger.info('Person record successfully created', { personId: id });
      return newPerson;
    } catch (error: any) {
      logger.error('Failed to create person record', { err: error, personId: id });
      throw error;
    }
  }

  async getPersons(limit: number = 30, cursor?: string): Promise<PaginatedResult<Person>> {
    const safeLimit = Math.min(Math.max(1, limit), 100);

    const params: QueryCommandInput = {
      TableName: this.tableName,
      IndexName: 'GSI1',
      KeyConditionExpression: 'GSI1PK = :gsi1pk',
      ExpressionAttributeValues: { ':gsi1pk': 'TYPE#PERSON' },
      Limit: safeLimit,
    };

    if (cursor) {
      try {
        const decoded = Buffer.from(cursor, 'base64').toString('utf-8');
        params.ExclusiveStartKey = JSON.parse(decoded);
      } catch (e) {
        throw new BadRequestError('Invalid cursor format');
      }
    }

    const result = await docClient.send(new QueryCommand(params));

    // OPERATIONAL METRIC: Tracks total records returned across fleet
    metrics.addMetric('PersonsListed', MetricUnit.Count, result.Count || 0);

    const items = (result.Items || []).map(item => {
      const { PK, SK, GSI1PK, GSI1SK, ...personProps } = item;
      return personProps as Person;
    });

    let nextCursor: string | null = null;
    if (result.LastEvaluatedKey) {
      const stringified = JSON.stringify(result.LastEvaluatedKey);
      nextCursor = Buffer.from(stringified).toString('base64');
    }

    return {
      items,
      nextCursor,
      count: items.length,
    };
  }
}
