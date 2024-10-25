import os
import json
import boto3
from botocore.exceptions import ClientError

app_eval_threshold_metrics = os.environ.get('AppGenAIEvalThresholdMetrics')

def get_evaluation_thresholds(application_name):
    """
    Retrieve the evaluation thresholds for a specific application from SSM Parameter Store.

    :param application_name: The name of the application
    :return: A dictionary containing the evaluation thresholds, or None if an error occurs
    """
    ssm_client = boto3.client('ssm')
    parameter_name = f"/AppGenAIEvalThresholdMetrics/{application_name}/threshold"

    try:
        response = ssm_client.get_parameter(
            Name=parameter_name,
            WithDecryption=True  # Set to True if it's a SecureString
        )
        value_string = response['Parameter']['Value']
        thresholds = json.loads(value_string)
        return thresholds

    except ClientError as e:
        if e.response['Error']['Code'] == 'ParameterNotFound':
            print(f"Parameter {parameter_name} not found.")
        else:
            print(f"An error occurred: {e}")
        return None
    except json.JSONDecodeError:
        print(f"Error decoding JSON from parameter {parameter_name}.")
        return None

def get_ssm_parameter(parameter_name):
    #ssm_client = boto3.Session(profile_name='hub-account').client('ssm')
    ssm_client = boto3.client('ssm')

    try:
        response = ssm_client.get_parameter(
            Name=parameter_name,
            WithDecryption=True  # Set to True if it's a SecureString
        )
        value_string = response['Parameter']['Value']
        parameter_dict = json.loads(value_string)
        return parameter_dict

    except ClientError as e:
        print(f"An error occurred: {e}")
        return None

def check_all_metrics_pass_thresholds(eval_results, threshold_metrics):
    all_metrics_passed = True
    result_messages = []

    for result in eval_results:
        gt_id = result.get('gt_id', 'Unknown')  # Get the gt_id, or 'Unknown' if it doesn't exist
        result_metrics = {k: v for k, v in result.items() if k != 'gt_id'}

        for metric, threshold in threshold_metrics.items():
            if metric not in result_metrics:
                message = f"Warning: Metric '{metric}' not found in evaluation result (gt_id: {gt_id})"
                print(message)
                result_messages.append(message)
                all_metrics_passed = False
            elif result_metrics[metric] < threshold:
                message = f"Metric '{metric}' failed: {result_metrics[metric]} < {threshold} (gt_id: {gt_id})"
                print(message)
                result_messages.append(message)
                all_metrics_passed = False
    return all_metrics_passed, result_messages


def lambda_handler(event, context):
    # Add your Lambda function code here
    print(event)
    application_name = event["application_name"]
    eval_results = event.get('eval_results', [])
    #threshold_metrics = get_ssm_parameter(app_eval_threshold_metrics)
    thresholds = get_evaluation_thresholds(application_name)

    all_metrics_passed, result_messages = check_all_metrics_pass_thresholds(eval_results, thresholds)
    
    all_metrics_within_thresholds="No"
    if all_metrics_passed:
        print("All metrics passed their thresholds")
        all_metrics_within_thresholds="Yes"
    else:
        print("Some metrics failed to meet their thresholds")
        all_metrics_within_thresholds="No"

    return {
        'all_metrics_within_thresholds': all_metrics_within_thresholds,
        'result_messages' : result_messages
    }