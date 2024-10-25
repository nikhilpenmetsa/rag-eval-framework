import * as cdk from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as iam from 'aws-cdk-lib/aws-iam';
import { Construct } from 'constructs';

export class EC2PublicInstanceStack extends cdk.Stack {
    constructor(scope: Construct, id: string, props?: cdk.StackProps) {
        super(scope, id, props);

        // Create a VPC
        const vpc = new ec2.Vpc(this, 'MyVPC', {
            maxAzs: 2,
            natGateways: 0,
            subnetConfiguration: [
                {
                    cidrMask: 24,
                    name: 'Public',
                    subnetType: ec2.SubnetType.PUBLIC,
                }
            ]
        });

        // Create a security group
        const securityGroup = new ec2.SecurityGroup(this, 'EC2SecurityGroup', {
            vpc,
            description: 'Allow TCP traffic on port 8501',
            allowAllOutbound: true
        });

        // Add inbound rule to allow TCP traffic on port 8501
        securityGroup.addIngressRule(
            ec2.Peer.anyIpv4(),
            ec2.Port.tcp(8501),
            'Allow incoming traffic on port 8501'
        );

        // Create an IAM role for the EC2 instance
        const role = new iam.Role(this, 'EC2InstanceRole', {
            assumedBy: new iam.ServicePrincipal('ec2.amazonaws.com'),
            managedPolicies: [
                iam.ManagedPolicy.fromAwsManagedPolicyName('AmazonSSMManagedInstanceCore'),
            ],
        });

        // Get the latest Amazon Linux 2023 AMI
        const latestAmiId = ec2.MachineImage.fromSsmParameter(
            '/aws/service/ami-amazon-linux-latest/al2023-ami-minimal-kernel-default-x86_64'
        );

        // Create an EC2 instance
        const instance = new ec2.Instance(this, 'MyEC2Instance', {
            vpc,
            vpcSubnets: {
                subnetType: ec2.SubnetType.PUBLIC
            },
            instanceType: ec2.InstanceType.of(ec2.InstanceClass.T2, ec2.InstanceSize.MICRO),
            machineImage: latestAmiId,
            securityGroup: securityGroup,
            role: role,
        });

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
