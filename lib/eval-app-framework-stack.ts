import * as path from 'path';
import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as sqs from 'aws-cdk-lib/aws-sqs';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as glue from 'aws-cdk-lib/aws-glue';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as sfn from 'aws-cdk-lib/aws-stepfunctions';
import * as tasks from 'aws-cdk-lib/aws-stepfunctions-tasks';
import * as sns from 'aws-cdk-lib/aws-sns';
import * as kinesisfirehose from 'aws-cdk-lib/aws-kinesisfirehose';
import { DefinitionBody } from 'aws-cdk-lib/aws-stepfunctions';

export class EvalAppFrameworkStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    //const uniqueId = PhysicalName.GENERATE_IF_NEEDED;
    //const uniqueId = cdk.Names.uniqueId(this);
    const uniqueId = cdk.Names.uniqueId(this).toLowerCase().replace(/[^a-z0-9]/g, '').substring(0, 8);


    // Define the application name (passed as a parameter to the stack)
    //const applicationName = 'YourApplicationName';

    // const evalThresholdMetricsParam = new ssm.StringParameter(this, 'AppGenAIEvalThresholdMetrics', {
    //   parameterName: `/AppGenAIEvalThresholdMetrics/${applicationName}`,
    //   stringValue: JSON.stringify({
    //     faithfulness: 0.8,
    //     answer_relevancy: 0.7,
    //     context_recall: 0.6,
    //     context_precision: 0.5
    //   }),
    //   description: `Application-specific thresholds for GenAI evaluation metrics for ${applicationName}`
    // });    

    // Create an SQS queue
    const queue = new sqs.Queue(this, 'MyQueue', {
      queueName: 'my-simple-queue',
      visibilityTimeout: cdk.Duration.seconds(300),
    });

    // Create an SNS topic
    const alertTopic = new sns.Topic(this, 'AlertTopic', {
      displayName: 'AlertTopic',
    });

    // Parameter
    // const dateString = new cdk.CfnParameter(this, 'DateString', {
    //   type: 'String',
    //   default: ''
    // });

    //const dateString = new Date().toISOString().split('T')[0].replace(/-/g, '');
    //const dateString = '20241018'
   
    // S3 Bucket
    const s3Bucket = new s3.Bucket(this, 'S3Bucket', {
      bucketName: `observability-${this.account}-${uniqueId}-s3-bucket`,
    });

    // Lambda Role
    const lambdaRole = new iam.Role(this, 'LambdaRole', {
      roleName: `observability-${this.account}-lambda-role-${uniqueId}`,
      assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
    });    

    // Lambda Role Policy
    const lambdaRolePolicy = new iam.ManagedPolicy(this, 'LambdaRolePolicy', {
      statements: [
        new iam.PolicyStatement({
          effect: iam.Effect.ALLOW,
          actions: ['logs:CreateLogGroup'],
          resources: ['*'],
        }),
        new iam.PolicyStatement({
          effect: iam.Effect.ALLOW,
          actions: ['logs:CreateLogStream', 'logs:PutLogEvents'],
          resources: ['arn:aws:logs:*:*:log-group:/aws/lambda/*'],
        }),
      ],
    });
    lambdaRole.addManagedPolicy(lambdaRolePolicy);

    // Lambda Function
    const firehoseLambdaFunction = new lambda.Function(this, 'LambdaFunction', {
      functionName: `observability-${this.account}-lambda-function-${uniqueId}`,
      runtime: lambda.Runtime.PYTHON_3_12,
      role: lambdaRole,
      memorySize: 256,
      timeout: cdk.Duration.seconds(120),
      handler: 'firehose_processing.lambda_handler',
      code: lambda.Code.fromAsset(path.join(__dirname, '../lambda/firehose')),
    });



    // Firehose Role
    const firehoseRole = new iam.Role(this, 'FirehoseRole', {
      roleName: `observability-${this.account}-firehose-role-${uniqueId}`,
      assumedBy: new iam.ServicePrincipal('firehose.amazonaws.com'),
    });

    // Firehose Role Policy
    const firehoseRolePolicy = new iam.ManagedPolicy(this, 'FirehoseRolePolicy', {
      statements: [
        new iam.PolicyStatement({
          effect: iam.Effect.ALLOW,
          actions: ['glue:GetTable', 'glue:GetTableVersion', 'glue:GetTableVersions'],
          resources: [
            `arn:aws:glue:${this.region}:${this.account}:catalog`,
            `arn:aws:glue:${this.region}:${this.account}:database/\${GlueDatabase}/*`,
            `arn:aws:glue:${this.region}:${this.account}:table/\${GlueDatabase}/*`,
          ],
        }),
        new iam.PolicyStatement({
          effect: iam.Effect.ALLOW,
          actions: [
            'kafka:GetBootstrapBrokers',
            'kafka:DescribeCluster',
            'kafka:DescribeClusterV2',
            'kafka-cluster:Connect',
          ],
          resources: [`arn:aws:kafka:${this.region}:${this.account}:cluster/*/*`],
        }),
        new iam.PolicyStatement({
          effect: iam.Effect.ALLOW,
          actions: [
            'kafka-cluster:DescribeTopic',
            'kafka-cluster:DescribeTopicDynamicConfiguration',
            'kafka-cluster:ReadData',
          ],
          resources: [`arn:aws:kafka:${this.region}:${this.account}:topic/*/*/*`],
        }),
        new iam.PolicyStatement({
          effect: iam.Effect.ALLOW,
          actions: ['kafka-cluster:DescribeGroup'],
          resources: [`arn:aws:kafka:${this.region}:${this.account}:group/*/*`],
        }),
        new iam.PolicyStatement({
          effect: iam.Effect.ALLOW,
          actions: [
            's3:AbortMultipartUpload',
            's3:GetBucketLocation',
            's3:GetObject',
            's3:ListBucket',
            's3:ListBucketMultipartUploads',
          ],
          resources: [s3Bucket.bucketArn, `${s3Bucket.bucketArn}/*`],
        }),
        new iam.PolicyStatement({
          effect: iam.Effect.ALLOW,
          actions: [
            'lambda:InvokeFunction',
            'lambda:GetFunctionConfiguration'
          ],
          resources: [firehoseLambdaFunction.functionArn],
        }),
      ],
    });

    const firehoseDeliveryStreamPolicy = new iam.ManagedPolicy(this, 'FirehoseDeliveryStreamPolicy', {
      statements: [
        new iam.PolicyStatement({
          effect: iam.Effect.ALLOW,
          actions: ['s3:PutObject'],
          resources: [
            s3Bucket.bucketArn,
            `${s3Bucket.bucketArn}/*`,
          ],
        }),
        new iam.PolicyStatement({
          effect: iam.Effect.ALLOW,
          actions: ['logs:PutLogEvents'],
          resources: [
            `arn:aws:logs:${this.region}:${this.account}:log-group:/aws/kinesisfirehose/*:log-stream:*`,
            `arn:aws:logs:${this.region}:${this.account}:log-group:*:log-stream:*`,
          ],
        }),
      ],
    });

    firehoseRole.addManagedPolicy(firehoseRolePolicy);
    firehoseRole.addManagedPolicy(firehoseDeliveryStreamPolicy);
    // firehoseRole.addToPolicy(new iam.PolicyStatement({
    //   actions: [
    //     'logs:PutLogEvents',
    //     'logs:CreateLogGroup',
    //     'logs:CreateLogStream'
    //   ],
    //   resources: [`arn:aws:logs:${this.region}:${this.account}:log-group:/aws/kinesisfirehose/*`]
    // }));




    firehoseRole.addToPolicy(new iam.PolicyStatement({
      actions: ['logs:PutLogEvents'],
      resources: [
        `arn:aws:logs:${this.region}:${this.account}:log-group:/aws/kinesisfirehose/*:log-stream:*`,
        `arn:aws:logs:${this.region}:${this.account}:log-group:*:log-stream:*`
      ]
    }));




    // Glue Role
    const glueRole = new iam.Role(this, 'GlueRole', {
      roleName: `kb-observability-${this.account}-glue-role-${uniqueId}`,
      assumedBy: new iam.ServicePrincipal('glue.amazonaws.com'),
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName('service-role/AWSGlueServiceRole')
      ]
    });

    // Glue Role Policy
    const glueRolePolicy = new iam.Policy(this, 'GlueRolePolicy', {
      statements: [
        new iam.PolicyStatement({
          effect: iam.Effect.ALLOW,
          actions: [
            's3:GetBucketLocation',
            's3:ListBucket',
            's3:GetObject',
            's3:PutObject'
          ],
          resources: [
            s3Bucket.bucketArn,
            `${s3Bucket.bucketArn}/*`
          ]
        })
      ]
    });

    glueRole.attachInlinePolicy(glueRolePolicy);

    // Glue Database
    const glueDatabase = new glue.CfnDatabase(this, 'GlueDatabase', {
      catalogId: this.account,
      databaseInput: {
        name: `observability-${this.account}-glue-database-${uniqueId}`
      }
    });

    // Glue Crawler
    const glueCrawler = new glue.CfnCrawler(this, 'GlueCrawler', {
      name: `observability-${this.account}-glue-crawler-${uniqueId}`,
      role: glueRole.roleArn,
      databaseName: glueDatabase.ref,  // Use .ref to get the database name
      description: 'Crawl Firehose S3 data to create a table in Athena',
      targets: {
        s3Targets: [
          {
            path: `s3://${s3Bucket.bucketName}/firehose-data/`
          }
        ]
      },
      configuration: JSON.stringify({
        Version: 1.0,
        CrawlerOutput: {
          Partitions: {
            AddOrUpdateBehavior: 'InheritFromTable'
          }
        }
      })
    });    
    
    // CloudWatch Log Group for Lambda
    const lambdaLogGroup = new logs.LogGroup(this, 'LambdaLogGroup', {
      logGroupName: `/aws/lambda/${firehoseLambdaFunction.functionName}`,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      retention: logs.RetentionDays.ONE_WEEK
    });

    // Create the Kinesis Firehose Delivery Stream
    const firehoseDeliveryStream = new kinesisfirehose.CfnDeliveryStream(this, 'FirehoseDeliveryStream', {
      deliveryStreamName: `observability-${this.account}-firehose-${uniqueId}`,
      deliveryStreamType: 'DirectPut',
      extendedS3DestinationConfiguration: {
        bucketArn: s3Bucket.bucketArn,
        bufferingHints: {
          intervalInSeconds: 60,
          sizeInMBs: 64
        },
        compressionFormat: 'UNCOMPRESSED',
        encryptionConfiguration: {
          noEncryptionConfig: 'NoEncryption'
        },
        prefix: 'firehose-data/!{partitionKeyFromLambda:dataset}/!{partitionKeyFromLambda:year}/!{partitionKeyFromLambda:month}/!{partitionKeyFromLambda:day}/!{partitionKeyFromLambda:hour}/',
        errorOutputPrefix: 'firehose-errors/',
        processingConfiguration: {
          enabled: true,
          processors: [
            {
              type: 'Lambda',
              parameters: [
                {
                  parameterName: 'LambdaArn',
                  parameterValue: firehoseLambdaFunction.functionArn
                }
              ]
            },
            {
              type: 'AppendDelimiterToRecord',
              parameters: [
                {
                  parameterName: 'Delimiter',
                  parameterValue: '\\n'
                }
              ]
            }
          ]
        },
        roleArn: firehoseRole.roleArn,
        dynamicPartitioningConfiguration: {
          enabled: true
        },
            // Add CloudWatch logging options
        cloudWatchLoggingOptions: {
          enabled: true,
          logGroupName: `/aws/kinesisfirehose/observability-${this.account}-firehose-${uniqueId}`,
          logStreamName: 'S3Delivery'
        }
      }
    });
    


    const evalLambdaRole = new iam.Role(this, 'evalLambdaExecutionRole', {
      assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
    });

    //evalLambdaRole.addManagedPolicy(iam.ManagedPolicy.fromAwsManagedPolicyName('service-role/AWSLambdaBasicExecutionRole'));    
    // Add policies to the existing role
    evalLambdaRole.addToPolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: [
        'logs:CreateLogGroup',
        'logs:CreateLogStream',
        'logs:PutLogEvents',
      ],
      resources: ['arn:aws:logs:*:*:*'],
    }));

    evalLambdaRole.addToPolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: ['bedrock:*'],
      resources: ['*'],
    }));

    evalLambdaRole.addToPolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: [
        'firehose:PutRecord',
        'firehose:PutRecordBatch',
      ],
      resources: ['*'],
    }));

    evalLambdaRole.addToPolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: [
        's3:GetObject',
        's3:PutObject',
        's3:ListBucket',
      ],
      resources: ['*'],
    }));

    evalLambdaRole.addToPolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: [
        'ssm:GetParameter',
        'ssm:GetParameters',
      ],
      resources: ['*']
    }));
    
    
    
    const ragEvalFunction = new lambda.DockerImageFunction(this, 'ragEvalFunction', {
      code: lambda.DockerImageCode.fromImageAsset(path.join(__dirname, '../lambda/rag-eval')),
      functionName: 'ragEvalFunction',
      role: evalLambdaRole,
      memorySize: 1024,
      timeout: cdk.Duration.seconds(300),
      environment: {
        FirehoseDeliveryStreamName: firehoseDeliveryStream.deliveryStreamName || '',
      }
    });    


    // ThresholdCheckLambdaExecutionRole
    const thresholdCheckLambdaExecutionRole = new iam.Role(this, 'ThresholdCheckLambdaExecutionRole', {
      assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName('service-role/AWSLambdaBasicExecutionRole')
      ]
    });

    // ThresholdCheckLambdaPermission
    const thresholdCheckPolicy = new iam.Policy(this, 'ThresholdCheckPolicy', {
      policyName: `EvalThresholdCheckPolicy`,
      statements: [
        new iam.PolicyStatement({
          effect: iam.Effect.ALLOW,
          actions: [
            'ssm:GetParameter',
            'ssm:GetParameters'
          ],
          resources: ['*']
        })
      ],
      roles: [thresholdCheckLambdaExecutionRole]
    });
    
    
    const thresholdCheckLambdaFunction = new lambda.Function(this, 'ThresholdCheckLambdaFunction', {
      functionName: `observability-${this.account}-threshold-check-function-${uniqueId}`,
      runtime: lambda.Runtime.PYTHON_3_12,
      role: thresholdCheckLambdaExecutionRole,
      memorySize: 256,
      timeout: cdk.Duration.seconds(120),
      handler: 'threshold_check_function.lambda_handler',
      code: lambda.Code.fromAsset(path.join(__dirname, '../lambda/thresholdcheck'))
      // environment: {
      //   AppGenAIEvalThresholdMetrics: evalThresholdMetricsParam.parameterName
      // }
    });


    // Step Function Role
    const stepFunctionRole = new iam.Role(this, 'StepFunctionRole', {
      roleName: 'YourStepFunctionName', // Replace with your actual Step Function name
      assumedBy: new iam.ServicePrincipal('states.amazonaws.com'),
    });

    // Step Function Execution Policy
    stepFunctionRole.addToPolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: ['lambda:InvokeFunction'],
      resources: [
        ragEvalFunction.functionArn,
        thresholdCheckLambdaFunction.functionArn
      ],
    }));

    stepFunctionRole.addToPolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: [
        'glue:StartCrawler',
        'glue:GetCrawler',
      ],
      resources: [
        `arn:aws:glue:${this.region}:${this.account}:crawler/${glueCrawler.ref}`
      ],
    }));

    // SNS Publish Policy
    stepFunctionRole.addToPolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: ['sns:Publish'],
      resources: [alertTopic.topicArn],
    }));    

    // Define the Step Function
    const evaluateKnowledgeBase = new tasks.LambdaInvoke(this, 'EvaluateKnowledgeBase', {
      lambdaFunction: ragEvalFunction,
      payloadResponseOnly: true,
      payload: sfn.TaskInput.fromObject({
        'execution_name.$': '$$.Execution.Name',
        'experiment_description.$': '$$.Execution.Input.experiment_description',
        'runMode.$': '$$.Execution.Input.runMode',
        'experiment_param.$': '$$.Execution.Input.experiment_param',
        'application_name.$': '$$.Execution.Input.application_name',
        'kb_id.$': '$',
        'gen_model_id.$': '$$.Execution.Input.gen_model_id',
        'judge_model_id.$': '$$.Execution.Input.judge_model_id',
        'embed_model_id.$': '$$.Execution.Input.embed_model_id',
        'max_token.$': '$$.Execution.Input.max_token',
        'temperature.$': '$$.Execution.Input.temperature[0]',
        'top_p.$': '$$.Execution.Input.top_p',
        'num_retriever_results.$': '$$.Execution.Input.num_retriever_results',
        'custom_tag.$': '$$.Execution.Input.custom_tag'
      })
    });

    const evaluateLLMTemperature = new tasks.LambdaInvoke(this, 'EvaluateLLMTemperature', {
      lambdaFunction: ragEvalFunction,
      payloadResponseOnly: true,
      payload: sfn.TaskInput.fromObject({
        'execution_name.$': '$$.Execution.Name',
        'experiment_description.$': '$$.Execution.Input.experiment_description',
        'runMode.$': '$$.Execution.Input.runMode',
        'experiment_param.$': '$$.Execution.Input.experiment_param',
        'application_name.$': '$$.Execution.Input.application_name',
        'kb_id.$': '$$.Execution.Input.kb_id[0]',
        'gen_model_id.$': '$$.Execution.Input.gen_model_id',
        'judge_model_id.$': '$$.Execution.Input.judge_model_id',
        'embed_model_id.$': '$$.Execution.Input.embed_model_id',
        'max_token.$': '$$.Execution.Input.max_token',
        'temperature.$': '$',
        'top_p.$': '$$.Execution.Input.top_p',
        'num_retriever_results.$': '$$.Execution.Input.num_retriever_results',
        'custom_tag.$': '$$.Execution.Input.custom_tag'
      })
    });

    const evaluateKnowledgeBases = new sfn.Map(this, 'EvaluateKnowledgeBases', {
      itemsPath: '$.kb_id',
      maxConcurrency: 1
    }).itemProcessor(evaluateKnowledgeBase);

    const evaluateTemperatures = new sfn.Map(this, 'EvaluateTemperatures', {
      itemsPath: '$.temperature',
      maxConcurrency: 1
    }).itemProcessor(evaluateLLMTemperature);

    const waitForFirehose = new sfn.Wait(this, 'WaitForFirehose', {
      time: sfn.WaitTime.duration(cdk.Duration.seconds(120))
    });


    const startCrawler = new tasks.CallAwsService(this, 'StartCrawler', {
      service: 'glue',
      action: 'startCrawler',
      parameters: {
        Name: glueCrawler.ref
      },
      iamResources: [`arn:aws:glue:${this.region}:${this.account}:crawler/${glueCrawler.ref}`]
    });

    const getCrawlerStatus = new tasks.CallAwsService(this, 'GetCrawlerStatus', {
      service: 'glue',
      action: 'getCrawler',
      parameters: {
        Name: glueCrawler.ref
      },
      iamResources: [`arn:aws:glue:${this.region}:${this.account}:crawler/${glueCrawler.ref}`]
    });

    const checkCrawlerStatus = new sfn.Choice(this, 'CheckCrawlerStatus')
      .when(sfn.Condition.stringEquals('$.Crawler.State', 'RUNNING'), new sfn.Wait(this, 'WaitForCrawler', {
        time: sfn.WaitTime.duration(cdk.Duration.seconds(30))
      }).next(getCrawlerStatus))
      .otherwise(new sfn.Pass(this, 'CrawlerComplete'));

    const processEvaluationMetrics = new sfn.Parallel(this, 'ProcessEvaluationMetrics')
      .branch(waitForFirehose.next(startCrawler).next(getCrawlerStatus).next(checkCrawlerStatus));

      const checkCurrentPerformance = new tasks.LambdaInvoke(this, 'CheckCurrentPerformance', {
        lambdaFunction: ragEvalFunction,
        payloadResponseOnly: true,
        resultPath: '$.lambdaResult.eval_results',
        payload: sfn.TaskInput.fromObject({
          'execution_name.$': '$$.Execution.Name',
          'experiment_description.$': '$.experiment_description',
          'runMode.$': '$.runMode',
          'experiment_param.$': '$.experiment_param',
          'application_name.$': '$.application_name',
          'kb_id.$': '$.kb_id',
          'gen_model_id.$': '$.gen_model_id',
          'judge_model_id.$': '$.judge_model_id',
          'embed_model_id.$': '$.embed_model_id',
          'max_token.$': '$.max_token',
          'temperature.$': '$.temperature',
          'top_p.$': '$.top_p',
          'num_retriever_results.$': '$.num_retriever_results',
          'custom_tag.$': '$.custom_tag'
        })
      });
  
      const comparePerformance = new tasks.LambdaInvoke(this, 'ComparePerformance', {
        lambdaFunction: thresholdCheckLambdaFunction,
        payloadResponseOnly: true,
        resultPath: '$.thresholdCheckResult',
        payload: sfn.TaskInput.fromObject({
          'eval_results.$': '$.lambdaResult.eval_results',
          'execution_name.$': '$$.Execution.Name',
          'experiment_description.$': '$.experiment_description',
          'runMode.$': '$.runMode',
          'experiment_param.$': '$.experiment_param',
          'application_name.$': '$.application_name',
          'kb_id.$': '$.kb_id',
          'gen_model_id.$': '$.gen_model_id',
          'judge_model_id.$': '$.judge_model_id',
          'embed_model_id.$': '$.embed_model_id',
          'max_token.$': '$.max_token',
          'temperature.$': '$.temperature',
          'top_p.$': '$.top_p',
          'num_retriever_results.$': '$.num_retriever_results',
          'custom_tag.$': '$.custom_tag'
        })
      });
  
      const definition = new sfn.Choice(this, 'BenchmarkOrValidation')
        .when(sfn.Condition.and(
          sfn.Condition.stringEquals('$.experiment_param', 'kb_id'),
          sfn.Condition.stringEquals('$.runMode', 'benchmark')
        ), evaluateKnowledgeBases)
        .when(sfn.Condition.and(
          sfn.Condition.stringEquals('$.experiment_param', 'temperature'),
          sfn.Condition.stringEquals('$.runMode', 'benchmark')
        ), evaluateTemperatures)
        .when(sfn.Condition.stringEquals('$.runMode', 'validation'), checkCurrentPerformance)
        .otherwise(checkCurrentPerformance);
  
      // Define the "Yes" state
      const yesState = new sfn.Pass(this, 'Yes', {
        result: sfn.Result.fromObject({ result: "All metrics within thresholds" }),
      });

      // Define the "No - Publish Alert" state
      const noPublishAlertState = new tasks.SnsPublish(this, 'No - Publish Alert', {
        topic: alertTopic,
        message: sfn.TaskInput.fromObject({
          default: "Metrics violated thresholds",
          email: {
            subject: "Threshold Violation Alert",
            body: sfn.JsonPath.format('Metrics violated thresholds. Details: {}', sfn.JsonPath.stringAt('$.thresholdCheckResult.result_messages'))
          }
        }),
      });

      // Define the Choice state
      const choiceState = new sfn.Choice(this, 'Current performance within thresholds?')
        .when(sfn.Condition.stringEquals('$.thresholdCheckResult.all_metrics_within_thresholds', 'Yes'), yesState)
        .otherwise(noPublishAlertState);
        
      evaluateKnowledgeBases.next(processEvaluationMetrics);
      evaluateTemperatures.next(processEvaluationMetrics);
      checkCurrentPerformance.next(comparePerformance);
      comparePerformance.next(choiceState);
      

      const stateMachine = new sfn.StateMachine(this, 'StateMachine', {
        definitionBody: DefinitionBody.fromChainable(definition),
        role: stepFunctionRole,
        stateMachineName: 'Eval-Workflow-V2'
      });

    // Output the stepfunction ARN
    new cdk.CfnOutput(this, 'StepFunctionArn', {
      value: stateMachine.stateMachineArn,
      description: 'ARN of the State Machine',
    });
  }
}
