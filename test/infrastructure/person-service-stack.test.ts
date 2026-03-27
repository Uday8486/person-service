import * as cdk from 'aws-cdk-lib/core';
import { Template, Match } from 'aws-cdk-lib/assertions';
import { PersonServiceStack } from '../../lib/person-service-stack';
import { describe, it } from 'vitest';

describe('PersonServiceStack', () => {
  const app = new cdk.App();
  const stack = new PersonServiceStack(app, 'TestStack', {
    appEnv: 'stage',
  });
  const template = Template.fromStack(stack);

  it('should have a DynamoDB table with correct keys and GSI', () => {
    template.hasResourceProperties('AWS::DynamoDB::Table', {
      KeySchema: [
        { AttributeName: 'PK', KeyType: 'HASH' },
        { AttributeName: 'SK', KeyType: 'RANGE' },
      ],
      GlobalSecondaryIndexes: [
        {
          IndexName: 'GSI1',
          KeySchema: [
            { AttributeName: 'GSI1PK', KeyType: 'HASH' },
            { AttributeName: 'GSI1SK', KeyType: 'RANGE' },
          ],
          Projection: {
            ProjectionType: 'ALL'
          }
        }
      ],
      BillingMode: 'PAY_PER_REQUEST',
    });
  });

  it('should have an SNS topic', () => {
    template.hasResource('AWS::SNS::Topic', {
      Properties: {
        TopicName: 'PersonCreatedTopic-stage',
      },
    });
  });

  it('should have a Lambda function with correct environment variables', () => {
    template.hasResourceProperties('AWS::Lambda::Function', {
      Handler: 'index.handler',
      Runtime: 'nodejs20.x',
      Environment: {
        Variables: {
          TABLE_NAME: Match.anyValue(),
          TOPIC_ARN: Match.anyValue(),
          APP_ENV: 'stage',
          POWERTOOLS_SERVICE_NAME: 'PersonService',
          POWERTOOLS_METRICS_NAMESPACE: 'PersonServiceNamespace',
        },
      },
      TracingConfig: {
        Mode: 'Active',
      },
      Timeout: 10,
    });
  });

  it('should have an HTTP API with correct routes', () => {
    template.hasResourceProperties('AWS::ApiGatewayV2::Api', {
      Name: 'PersonServiceAPI-stage',
    });

    template.hasResourceProperties('AWS::ApiGatewayV2::Route', {
      RouteKey: 'GET /person',
    });

    template.hasResourceProperties('AWS::ApiGatewayV2::Route', {
      RouteKey: 'POST /person',
    });
  });

  it('should have a Stage with throttling and autoDeploy', () => {
    template.hasResourceProperties('AWS::ApiGatewayV2::Stage', {
      StageName: '$default',
      AutoDeploy: true,
      DefaultRouteSettings: {
        DetailedMetricsEnabled: true,
        ThrottlingBurstLimit: 100,
        ThrottlingRateLimit: 50,
      },
    });
  });

  it('should have a CloudWatch dashboard', () => {
    template.hasResourceProperties('AWS::CloudWatch::Dashboard', {
      DashboardName: 'PersonService-stage',
    });
  });
});
