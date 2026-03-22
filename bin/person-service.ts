#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib/core';
import { PersonServiceStack } from '../lib/person-service-stack';

const app = new cdk.App();

new PersonServiceStack(app, 'PersonServiceStack-stage', {
  appEnv: 'stage',
  description: 'Person Service — stage environment',
});

new PersonServiceStack(app, 'PersonServiceStack-prod', {
  appEnv: 'prod',
  description: 'Person Service — prod environment',
});