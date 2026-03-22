import * as cdk from 'aws-cdk-lib/core';
import { Template } from 'aws-cdk-lib/assertions';
import * as PersonService from '../lib/person-service-stack';
import { test, expect } from 'vitest';

test('HTTP API Created', () => {
    const app = new cdk.App();
    // WHEN
    const stack = new PersonService.PersonServiceStack(app, 'MyTestStack');
    // THEN
    const template = Template.fromStack(stack);

    template.hasResourceProperties('AWS::ApiGatewayV2::Api', {
        Name: 'PersonServiceAPI'
    });

    template.hasResourceProperties('AWS::ApiGatewayV2::Stage', {
        StageName: 'test',
        AutoDeploy: true
    });
});
