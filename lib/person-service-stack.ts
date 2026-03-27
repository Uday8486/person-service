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
import * as cloudwatch from 'aws-cdk-lib/aws-cloudwatch';

export type AppEnv = 'stage' | 'prod';

export interface PersonServiceStackProps extends cdk.StackProps {
  appEnv: AppEnv;
}

interface EnvironmentConfig {
  removalPolicy: cdk.RemovalPolicy;
  logRetention: logs.RetentionDays;
  throttlingBurstLimit: number;
  throttlingRateLimit: number;
}

const envConfigs: Record<AppEnv, EnvironmentConfig> = {
  stage: {
    removalPolicy: cdk.RemovalPolicy.DESTROY,
    logRetention: logs.RetentionDays.ONE_MONTH,
    throttlingBurstLimit: 100,
    throttlingRateLimit: 50,
  },
  prod: {
    removalPolicy: cdk.RemovalPolicy.RETAIN,
    logRetention: logs.RetentionDays.THREE_MONTHS,
    throttlingBurstLimit: 1500,
    throttlingRateLimit: 1000,
  },
};

export class PersonServiceStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: PersonServiceStackProps) {
    super(scope, id, props);

    const { appEnv } = props;
    const config = envConfigs[appEnv];

    // The code that defines your stack goes here

    const table = new dynamodb.Table(this, 'PersonTable', {
      tableName: `PersonTable-${appEnv}`,
      partitionKey: { name: 'PK', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'SK', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: config.removalPolicy,
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
      topicName: `PersonCreatedTopic-${appEnv}`,
    });

    // Lambda Function
    const handler = new nodejs.NodejsFunction(this, 'PersonServiceLambda', {
      functionName: `PersonServiceLambda-${appEnv}`,
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
      memorySize: 512,
      timeout: cdk.Duration.seconds(10),
      logRetention: config.logRetention,
    });

    table.grantReadWriteData(handler);
    topic.grantPublish(handler);

    const api = new apigwv2.HttpApi(this, 'PersonServiceHttpApi', {
      apiName: `PersonServiceAPI-${appEnv}`,
      createDefaultStage: false
    });

    const integration = new apigwv2_integrations.HttpLambdaIntegration(
      'PersonIntegration',
      handler,
    );

    api.addRoutes({
      path: '/person',
      methods: [apigwv2.HttpMethod.GET, apigwv2.HttpMethod.POST],
      integration: integration,
      // authorizer // TODO: Add authorizer
    });

    const stage = new apigwv2.HttpStage(this, 'PersonServiceStage', {
      httpApi: api,
      stageName: '$default',
      throttle: {
        rateLimit: config.throttlingRateLimit,
        burstLimit: config.throttlingBurstLimit,
      },
      autoDeploy: true,
    });

    // Enable detailed metrics to get per-method and per-resource metrics
    const cfnStage = stage.node.defaultChild as apigwv2.CfnStage;
    cfnStage.defaultRouteSettings = {
      detailedMetricsEnabled: true,
      throttlingBurstLimit: config.throttlingBurstLimit,
      throttlingRateLimit: config.throttlingRateLimit,
    };

    // Output URL
    new cdk.CfnOutput(this, 'ApiUrl', {
      value: stage.url!,
      exportName: `PersonServiceApiUrl-${appEnv}`,
    });

    // CloudWatch Dashboard
    const dashboard = new cloudwatch.Dashboard(this, 'PersonServiceDashboard', {
      dashboardName: `PersonService-${appEnv}`,
    });

    // API Latency Widget (Per Method)
    const apiLatencyWidget = new cloudwatch.GraphWidget({
      title: 'API Latency (Per Method)',
      left: [
        new cloudwatch.Metric({
          namespace: 'AWS/ApiGateway',
          metricName: 'Latency',
          dimensionsMap: {
            ApiId: api.apiId,
            Stage: stage.stageName,
            Method: 'GET',
            Resource: '/person',
          },
          statistic: 'p99',
          label: 'GET p99 Latency',
        }),
        new cloudwatch.Metric({
          namespace: 'AWS/ApiGateway',
          metricName: 'Latency',
          dimensionsMap: {
            ApiId: api.apiId,
            Stage: stage.stageName,
            Method: 'POST',
            Resource: '/person',
          },
          statistic: 'p99',
          label: 'POST p99 Latency',
        }),
      ],
      width: 12,
    });

    // API Errors Widget (Per Method)
    const apiErrorsWidget = new cloudwatch.GraphWidget({
      title: 'API Errors (4xx, 5xx) Per Method',
      left: [
        new cloudwatch.Metric({
          namespace: 'AWS/ApiGateway',
          metricName: '4xx',
          dimensionsMap: {
            ApiId: api.apiId,
            Stage: stage.stageName,
            Method: 'GET',
            Resource: '/person',
          },
          statistic: 'Sum',
          label: 'GET 4xx',
        }),
        new cloudwatch.Metric({
          namespace: 'AWS/ApiGateway',
          metricName: '5xx',
          dimensionsMap: {
            ApiId: api.apiId,
            Stage: stage.stageName,
            Method: 'GET',
            Resource: '/person',
          },
          statistic: 'Sum',
          label: 'GET 5xx',
        }),
        new cloudwatch.Metric({
          namespace: 'AWS/ApiGateway',
          metricName: '4xx',
          dimensionsMap: {
            ApiId: api.apiId,
            Stage: stage.stageName,
            Method: 'POST',
            Resource: '/person',
          },
          statistic: 'Sum',
          label: 'POST 4xx',
        }),
        new cloudwatch.Metric({
          namespace: 'AWS/ApiGateway',
          metricName: '5xx',
          dimensionsMap: {
            ApiId: api.apiId,
            Stage: stage.stageName,
            Method: 'POST',
            Resource: '/person',
          },
          statistic: 'Sum',
          label: 'POST 5xx',
        }),
      ],
      width: 12,
    });

    // Lambda Performance Widget
    const lambdaPerformanceWidget = new cloudwatch.GraphWidget({
      title: 'Lambda Performance',
      left: [
        handler.metricDuration({ statistic: 'Average', label: 'Avg Duration' }),
        handler.metricDuration({ statistic: 'Maximum', label: 'Max Duration' }),
      ],
      width: 12,
    });

    // Lambda Errors Widget
    const lambdaErrorsWidget = new cloudwatch.GraphWidget({
      title: 'Lambda Errors & Throttles',
      left: [
        handler.metricErrors({ statistic: 'Sum', label: 'Errors' }),
        handler.metricThrottles({ statistic: 'Sum', label: 'Throttles' }),
      ],
      width: 12,
    });

    dashboard.addWidgets(
      new cloudwatch.Row(apiLatencyWidget, apiErrorsWidget),
      new cloudwatch.Row(lambdaPerformanceWidget, lambdaErrorsWidget)
    );
  }
}
