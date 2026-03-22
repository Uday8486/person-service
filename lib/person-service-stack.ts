import * as cdk from 'aws-cdk-lib/core';
import { Construct } from 'constructs';
// import * as sqs from 'aws-cdk-lib/aws-sqs';
import * as path from 'path';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as sns from 'aws-cdk-lib/aws-sns';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as nodejs from 'aws-cdk-lib/aws-lambda-nodejs';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as apigwv2 from 'aws-cdk-lib/aws-apigatewayv2';
import * as apigwv2_integrations from 'aws-cdk-lib/aws-apigatewayv2-integrations';

export class PersonServiceStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const appEnv = 'test';

    // The code that defines your stack goes here

    const table = new dynamodb.Table(this, 'PersonTable', {
      tableName: `PersonTable`,
      partitionKey: { name: 'PK', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'SK', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
      pointInTimeRecoverySpecification: {
        pointInTimeRecoveryEnabled: true,
      },
    });

    table.addGlobalSecondaryIndex({
      indexName: 'GSI1',
      partitionKey: { name: 'GSI1PK', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'GSI1SK', type: dynamodb.AttributeType.STRING },
      projectionType: dynamodb.ProjectionType.ALL,
    });

    const topic = new sns.Topic(this, 'PersonCreatedTopic', {
      topicName: `PersonCreatedTopic`,
    });

    // Lambda Function
    const handler = new nodejs.NodejsFunction(this, 'PersonServiceLambda', {
      runtime: lambda.Runtime.NODEJS_20_X,
      architecture: lambda.Architecture.ARM_64,
      entry: path.join(__dirname, '../src/handler.ts'),
      handler: 'handler',
      bundling: {
        minify: true,
        sourceMap: true,
      },
      environment: {
        TABLE_NAME: table.tableName,
        TOPIC_ARN: topic.topicArn,
        APP_ENV: appEnv,
      },
      tracing: lambda.Tracing.ACTIVE,
      logRetention: logs.RetentionDays.ONE_MONTH,
      memorySize: 512,
    });

    table.grantReadWriteData(handler);
    topic.grantPublish(handler);

    const api = new apigwv2.HttpApi(this, 'PersonServiceHttpApi', {
      apiName: `PersonServiceAPI`,
    });

    const integration = new apigwv2_integrations.HttpLambdaIntegration(
      'PersonIntegration',
      handler,
    );

    api.addRoutes({
      path: '/person',
      methods: [apigwv2.HttpMethod.ANY],
      integration: integration,
      // authorizer // TODO: Add authorizer
    });

    const stage = new apigwv2.HttpStage(this, 'PersonServiceStage', {
      httpApi: api,
      stageName: appEnv,
      throttle: {
        rateLimit: 1000,
        burstLimit: 500,
      },
      autoDeploy: true,
    });

    // Output URL
    new cdk.CfnOutput(this, 'ApiUrl', {
      value: stage.url!,
      exportName: `PersonServiceApiUrl-${appEnv}`,
    });
  }
}
