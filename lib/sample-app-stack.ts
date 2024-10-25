import * as cdk from 'aws-cdk-lib';
import * as ssm from 'aws-cdk-lib/aws-ssm';
import { Construct } from 'constructs';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as s3deploy from 'aws-cdk-lib/aws-s3-deployment';
//import * as bedrock from 'aws-cdk-lib/aws-bedrock';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as path from 'path';
import * as opensearchserverless from 'aws-cdk-lib/aws-opensearchserverless';
import { bedrock } from '@cdklabs/generative-ai-cdk-constructs';

interface SampleAppStackProps extends cdk.StackProps {
    applicationName?: string;
  }
  
export class SampleAppStack extends cdk.Stack {

    public dataSource: bedrock.S3DataSource;
    public knowledgeBase: bedrock.KnowledgeBase;

    constructor(scope: Construct, id: string, props?: SampleAppStackProps) {
        super(scope, id, props);

        const uniqueId = cdk.Names.uniqueId(this).toLowerCase().replace(/[^a-z0-9]/g, '').substring(0, 8);

        const applicationName = props?.applicationName || 'DefaultAppName';
        const applicationNameLowerCase = applicationName.toLowerCase();
        //const applicationName = 'blogapp1'
        //file_key = 'ground_truth/ground_truth.csv'

        const evalThresholdMetricsParam = new ssm.StringParameter(this, 'AppGenAIEvalThresholdMetrics', {
            parameterName: `/AppGenAIEvalThresholdMetrics/${applicationName}/threshold`,
            stringValue: JSON.stringify({
                faithfulness: 0.8,
                answer_relevancy: 0.7,
                context_recall: 0.6,
                context_precision: 0.5
            }),
            description: `Application-specific thresholds for GenAI evaluation metrics for ${applicationName}`
        });

        // Create the S3 bucket
        const gtBucket = new s3.Bucket(this, 'S3BucketAppGroundTruth', {
            bucketName: `gt-${applicationNameLowerCase}-${uniqueId}-s3-bucket`,
            // Add any other bucket properties you need
        });
    
        // Deploy the file to the bucket
        new s3deploy.BucketDeployment(this, 'S3BucketAppGroundTruthDeploy', {
            sources: [s3deploy.Source.asset(path.join(__dirname, '../data'))],
            destinationBucket: gtBucket,
            destinationKeyPrefix: 'ground_truth/', // Optional: if you want to put the file in a "folder" in the bucket
        });

            // Create new SSM parameter for ground truth S3 location
        const evalGroundTruthParam = new ssm.StringParameter(this, 'AppGenAIEvalGroundTruthLocation', {
            parameterName: `/AppGenAIEvalThresholdMetrics/${applicationName}/groundtruth`,
            stringValue: JSON.stringify({
            bucket: gtBucket.bucketName,
            prefix: 'ground_truth/'
            }),
            description: `S3 location for ground truth data for ${applicationName}`
        });

        // Create an S3 bucket for the Knowledge Base data
        const knowledgeBaseBucket = new s3.Bucket(this, 'S3BucketKnowledgeBase', {
            bucketName: `kb-${applicationNameLowerCase}-${uniqueId}-s3-bucket`,
            encryption: s3.BucketEncryption.S3_MANAGED,
            removalPolicy: cdk.RemovalPolicy.DESTROY, // Be cautious with this in production
            autoDeleteObjects: true, // Be cautious with this in production
        });
    
        // Deploy a local file to the S3 bucket
        new s3deploy.BucketDeployment(this, 'S3BucketKnowledgeBaseDeploy', {
            sources: [s3deploy.Source.asset(path.join(__dirname, '../data/kb'))], // Adjust this path as needed
            destinationBucket: knowledgeBaseBucket,
            destinationKeyPrefix: 'kb-data/',
        });
    
        // create the bedrock knowledge base
        this.knowledgeBase = new bedrock.KnowledgeBase(this, 'BedrockKnowledgeBase', {
            name: `kb-${applicationNameLowerCase}-${uniqueId}`,
            embeddingsModel: bedrock.BedrockFoundationModel.TITAN_EMBED_TEXT_V1,
            instruction: `Use this knowledge base to answer questions about wealthtech faqs`,
        });
        
        this.dataSource = new bedrock.S3DataSource(this, 'DataSource', {
            bucket: knowledgeBaseBucket,
            knowledgeBase: this.knowledgeBase,
            dataSourceName: `ds-${applicationNameLowerCase}-${uniqueId}`,
            chunkingStrategy: bedrock.ChunkingStrategy.DEFAULT
            //maxTokens: 500,
            //overlapPercentage: 20,
        });

    }
}


