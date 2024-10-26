# A framework to evaluate performance of RAG based applications

As enterprises accelerate the adoption of Generative AI from proof-of-concept to production-grade applications, the need for robust evaluation of Retrieval Augmented Generation (RAG) systems becomes increasingly critical.

Code in this repository provides a RAG evaluation framework built on Ragas framework using various AWS services. This solution supports two different evaluation modes. 

1. Benchmark mode compares multiple RAG configurations performance against one another. This mode is useful when evaluating the adoption of new configurations, such as testing new language models, changest to prompt templates, updates to chunking strategies. 
2. Validation mode compares current RAG configuration's performance metrics against pre-defined thresholds. This mode is useful for integration into operational monitoring and CICD pipelines.

The framework uses AWS Step Functions to orchestrate the evaluation in both modes. The Step Function invokes an AWS Lambda function which uses the Ragas library to run the evalutions. When run in Benchmark mode, multiple configurations such as different temperatures can be evaluated against one another. When run in validation mode, the evaluation metrics are compared against pre-defined thresholds. If the metrics do not meet the pre-defined thresholds, a notification is published to an Amazon SNS topic. Metrics from both evaluation modes are persisted in S3 using Kinesis Firehose. AWS Glue is used to catalog these metrics, and Amazon Athena is used to query these metrics for visualization and reporting.

## Evaluation Flow
![EvaluationFlow-Page-1](EvaluationFlow-Page-1.png)

## Deployment overview
This solution is deployed in 3 stacks
1. The RAG evaluation framework stack. 
1. A sample application stack. This stack contains:
   
   a. An SSM parameter which defines the threshold metrics for this application
   
   b. A CSV file that has ground truth data
   
   c. A Bedrock knowledge base. The data indexed in this KB and the ground truth are synthetic data for a 10K filing of a fictitious company


1. A reporting stack. This stack deploys an EC2 instance that runs a streamlit application. This streamlit application provides simple UI to analyze the evaluation metrics for various runs.

## Sample evaluation report
![Evaluation report](visualization.png)


## Deployment steps
1. Deploy the evaluation framework stack - `cdk deploy EvalAppFrameworkStack`
1. Deploy the sample application stack - `cdk deploy SampleAppStack`
1. Create an email subscription for the SNS topic created. Activate the subscription from email.
1. Deploy the reporting stack - `cdk deploy ReportingStack`

## Testing steps
1. Run an evaluation in benchmark mode. Change directory to scripts. `cd scripts` and run `./test_workflow.sh`.
1. TODO

