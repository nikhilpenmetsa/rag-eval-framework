#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { EvalAppFrameworkStack } from '../lib/eval-app-framework-stack';
import { SampleAppStack } from '../lib/sample-app-stack';
import { ReportStack } from '../lib/report-stack';


const app = new cdk.App();
new EvalAppFrameworkStack(app, 'EvalAppFrameworkStack', {
});


// Sample Application stack with the SSM parameter
new SampleAppStack(app, 'SampleAppStack', {
  applicationName: 'SampleApp1',
});

new ReportStack(app, 'ReportStack', {
  keyPairName: '2024_v1',
});

