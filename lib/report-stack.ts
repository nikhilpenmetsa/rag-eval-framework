import * as cdk from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as s3deploy from 'aws-cdk-lib/aws-s3-deployment';
import * as path from 'path';
import { Construct } from 'constructs';
import * as athena from 'aws-cdk-lib/aws-athena';

interface ReportStackProps extends cdk.StackProps {
    keyPairName?: string;
}


export class ReportStack extends cdk.Stack {
    constructor(scope: Construct, id: string, props?: ReportStackProps) {
        super(scope, id, props);

        const keyPairName = props?.keyPairName || 'keyPairName';

        // Create an S3 bucket
        const streamLitCodeBucket = new s3.Bucket(this, 'S3streamLitCodeBucket', {
            versioned: true,
            encryption: s3.BucketEncryption.S3_MANAGED,
            removalPolicy: cdk.RemovalPolicy.DESTROY, // NOTE: This is not recommended for production
            autoDeleteObjects: true, // NOTE: This is not recommended for production
        });

        // Deploy the local file to the S3 bucket
        new s3deploy.BucketDeployment(this, 'S3streamLitCodeBucketDeployment', {
            sources: [s3deploy.Source.asset(path.join(__dirname, '../report'))],
            destinationBucket: streamLitCodeBucket,
            destinationKeyPrefix: 'scripts', // This will put the file in a 'scripts' folder in the bucket
        });

        // Create a new S3 bucket for Athena query results
        const athenaResultsBucket = new s3.Bucket(this, 'S3athenaResultsBucket', {
            versioned: true,
            encryption: s3.BucketEncryption.S3_MANAGED,
            removalPolicy: cdk.RemovalPolicy.DESTROY, // NOTE: This is not recommended for production
            autoDeleteObjects: true, // NOTE: This is not recommended for production
        });


        // Create a new Athena workgroup
        const myWorkGroup = new athena.CfnWorkGroup(this, 'MyAthenaWorkGroup', {
            name: 'my-athena-workgroup',
            description: 'Workgroup for my Athena queries',
            state: 'ENABLED',
            workGroupConfiguration: {
                resultConfiguration: {
                    outputLocation: `s3://${athenaResultsBucket.bucketName}/`
                }
            }
        });


        // Create a VPC
        const vpc = new ec2.Vpc(this, 'ReportVPC', {
            maxAzs: 2,
            natGateways: 1,
        });

        // Create an IAM role for the EC2 instance
        const role = new iam.Role(this, 'ReportInstanceRole', {
            assumedBy: new iam.ServicePrincipal('ec2.amazonaws.com'),
            managedPolicies: [
                iam.ManagedPolicy.fromAwsManagedPolicyName('AmazonSSMManagedInstanceCore'),
            ],
        });

        // Add S3 read permissions to the role
        role.addToPolicy(new iam.PolicyStatement({
            actions: ['s3:GetObject', 's3:ListBucket'],
            resources: [streamLitCodeBucket.bucketArn, `${streamLitCodeBucket.bucketArn}/*`],
        }));

        role.addToPolicy(new iam.PolicyStatement({
            actions: [
                'states:ListExecutions',
                'states:DescribeExecution',
            ],
            resources: ['*'],
        }));

        // Add Athena permissions to the role
        role.addToPolicy(new iam.PolicyStatement({
            actions: [
                'athena:StartQueryExecution',
                'athena:GetQueryExecution',
                'athena:GetQueryResults',
                'athena:StopQueryExecution',
                'athena:ListQueryExecutions',
                'athena:BatchGetQueryExecution',
                'athena:GetWorkGroup',
            ],
            resources: [
                `arn:aws:athena:${this.region}:${this.account}:workgroup/${myWorkGroup.name}`,
                `arn:aws:athena:${this.region}:${this.account}:workgroup/primary`
            ]
        }));

        // Add additional Athena permissions that don't support resource-level permissions
        role.addToPolicy(new iam.PolicyStatement({
            actions: [
                'athena:ListWorkGroups',
                'athena:ListEngineVersions',
                'athena:ListDataCatalogs',
                'athena:ListDatabases',
                'athena:GetDataCatalog',
                'athena:GetDatabase',
                'athena:GetTableMetadata',
                'athena:ListTableMetadata',
            ],
            resources: ['*']
        }));


        // Add S3 permissions for the Athena results location
        // remove wildcard reource
        role.addToPolicy(new iam.PolicyStatement({
            actions: [
                's3:GetBucketLocation',
                's3:GetObject',
                's3:ListBucket',
                's3:ListBucketMultipartUploads',
                's3:ListMultipartUploadParts',
                's3:AbortMultipartUpload',
                's3:CreateBucket',
                's3:PutObject'
            ],
            // resources: [
            //     athenaResultsBucket.bucketArn,
            //     `${athenaResultsBucket.bucketArn}/*`
            // ]
            resources: ['*']
        }));

        // Add Glue permissions (Athena uses Glue Data Catalog)
        role.addToPolicy(new iam.PolicyStatement({
            actions: [
                'glue:GetTable',
                'glue:GetPartitions',
                'glue:GetDatabase',
            ],
            resources: ['*'], // You might want to restrict this to specific Glue databases and tables
        }));


        // Create a security group
        const securityGroup = new ec2.SecurityGroup(this, 'StreamlitSecurityGroup', {
            vpc,
            description: 'Allow inbound traffic on port 8501 for Streamlit',
            allowAllOutbound: true,
        });

        // Add inbound rule to allow TCP traffic on port 8501
        securityGroup.addIngressRule(
            ec2.Peer.anyIpv4(),
            ec2.Port.tcp(8501),
            'Allow inbound traffic on port 8501'
        );

        securityGroup.addIngressRule(
            ec2.Peer.anyIpv4(),
            ec2.Port.tcp(22),
            'Allow SSH access'
        );
        // Add self-referencing rule (all protocols)
        securityGroup.addIngressRule(
            securityGroup,
            ec2.Port.allTraffic(),
            'Allow all traffic within the security group'
        );

        // Get the latest Amazon Linux 2023 AMI
        const latestAmiId = ec2.MachineImage.fromSsmParameter(
            '/aws/service/ami-amazon-linux-latest/al2023-ami-minimal-kernel-default-x86_64'
        );

        // Create an EC2 instance
        const instance = new ec2.Instance(this, 'ReportInstance', {
            vpc,
            vpcSubnets: { subnetType: ec2.SubnetType.PUBLIC }, // Ensure the instance is in a public subnet
            instanceType: ec2.InstanceType.of(ec2.InstanceClass.T2, ec2.InstanceSize.MICRO),
            machineImage: latestAmiId,
            instanceName: 'ReportInstance',
            role: role,
            securityGroup: securityGroup,
            keyName: keyPairName,
        });

        // Copy the analyze_v2.py file to the EC2 instance
        instance.userData.addCommands(
            'sudo yum install -y python3 aws-cli',
            `aws s3 cp s3://${streamLitCodeBucket.bucketName}/scripts/ /home/ec2-user/streamlit/ --recursive`,
            `cd /home/ec2-user/streamlit/`,
            `source ./setup-streamlit-env.sh`,
            `streamlit run analyze.py`
        );

        // Output the bucket name
        new cdk.CfnOutput(this, 'streamLitCodeBucket', {
            value: streamLitCodeBucket.bucketName,
            description: 'The name of the S3 bucket',
        });

        // Output the instance ID
        new cdk.CfnOutput(this, 'InstanceId', {
            value: instance.instanceId,
            description: 'The ID of the EC2 instance',
        });

        // ... (rest of the code remains the same)

        // Output the public IP address of the instance
        new cdk.CfnOutput(this, 'InstancePublicIp', {
            value: instance.instancePublicIp,
            description: 'The public IP address of the EC2 instance',
        });

        // Output the public DNS name of the instance
        new cdk.CfnOutput(this, 'InstancePublicDnsName', {
            value: instance.instancePublicDnsName,
            description: 'The public DNS name of the EC2 instance',
        });

    }
}