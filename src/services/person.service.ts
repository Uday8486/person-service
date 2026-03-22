import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  PutCommand,
} from '@aws-sdk/lib-dynamodb';
import { SNSClient, PublishCommand } from '@aws-sdk/client-sns';
import { v4 as uuidv4 } from 'uuid';
import { Logger } from '@aws-lambda-powertools/logger';
import { Metrics, MetricUnit } from '@aws-lambda-powertools/metrics';
import { Tracer } from '@aws-lambda-powertools/tracer';

export const logger = new Logger();
export const metrics = new Metrics();
export const tracer = new Tracer();

import { Person } from '../models/person';

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
}
