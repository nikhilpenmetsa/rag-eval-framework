import base64
import json
import datetime

def flatten_json(nested_json):
    flat_json = {}

    def flatten(x, name=''):
        if isinstance(x, dict):
            for key, value in x.items():
                key_with_underscores = key.replace('-', '_')  # Convert dashes to underscores
                if key == 'citations': # not normalizing citations
                    flat_json[key] = value
                else:
                    flatten(value, f"{name}_{key_with_underscores}" if name else key_with_underscores)
        elif isinstance(x, list):
            for i, item in enumerate(x):
                flatten(item, f"{name}[{i}]")
        else:
            flat_json[name] = x

    flatten(nested_json)
    return flat_json
    
def deduplicate_json(data):
    if isinstance(data, dict):
        result = {}
        for key, value in data.items():
            if isinstance(value, (dict, list)):
                value = deduplicate_json(value)
            if key not in result:
                result[key] = value
            else:
                if isinstance(value, list):
                    result[key].extend(value)
                else:
                    result[key] = [result[key], value]
        return result
    elif isinstance(data, list):
        result = []
        for item in data:
            if isinstance(item, (dict, list)):
                item = deduplicate_json(item)
            if item not in result:
                result.append(item)
        return result
    else:
        return data

def lambda_handler(event, context):
    output = []

    for record in event['records']:
        payload = base64.b64decode(record['data']).decode('utf-8')

        # Flatten the JSON payload
        try:
            data = json.loads(payload)
            flattened_data = flatten_json(data)
            flattened_data = deduplicate_json(flattened_data)
            flattened_payload = json.dumps(flattened_data)
        except (ValueError, TypeError):
            print(f"Error flattening JSON for record: {record['recordId']}")
            
        # Get the current system date and time
        now = datetime.datetime.now()
        year = now.year
        month = now.month
        day = now.day
        hour = now.hour
            
        partition_keys = {
            'dataset': flattened_data['call_type'],
            'year': year,
            'month': month,
            'day': day,
            'hour': hour
        }

        output_record = {
            'recordId': record['recordId'],
            'result': 'Ok',
            'data': base64.b64encode(flattened_payload.encode('utf-8')).decode('utf-8'),
            'metadata': {'partitionKeys': partition_keys}
        }
        output.append(output_record)

    print('Successfully processed {} records.'.format(len(event['records'])))

    return {'records': output}
