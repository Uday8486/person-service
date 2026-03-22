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

export type AppEnv = 'stage' | 'prod';

export interface PersonServiceStackProps extends cdk.StackProps {
  appEnv: AppEnv;
}

export class PersonServiceStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: PersonServiceStackProps) {
    super(scope, id, props);

    const { appEnv } = props;

    // The code that defines your stack goes here

    const table = new dynamodb.Table(this, 'PersonTable', {
      tableName: `PersonTable`,
      partitionKey: { name: 'PK', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'SK', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
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
        externalModules: []
      },
      environment: {
        TABLE_NAME: table.tableName,
        TOPIC_ARN: topic.topicArn,
        APP_ENV: appEnv,
        POWERTOOLS_SERVICE_NAME: 'PersonService',
        POWERTOOLS_METRICS_NAMESPACE: 'PersonServiceNamespace',
      },
      tracing: lambda.Tracing.ACTIVE,
      logRetention: logs.RetentionDays.ONE_MONTH,
      memorySize: 512,
    });

    table.grantReadWriteData(handler);
    topic.grantPublish(handler);

    const api = new apigwv2.HttpApi(this, 'PersonServiceHttpApi', {
      apiName: `PersonServiceAPI`,
      createDefaultStage: false
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
      stageName: '$default',
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
