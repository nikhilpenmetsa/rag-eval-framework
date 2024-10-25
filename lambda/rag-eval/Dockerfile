FROM public.ecr.aws/lambda/python:3.12

# Copy function code
COPY ragas_eval_function.py ${LAMBDA_TASK_ROOT}
COPY evaluation.py ${LAMBDA_TASK_ROOT}
COPY observability.py ${LAMBDA_TASK_ROOT}

# Install the function's dependencies
COPY requirements.txt .
RUN pip3 install -r requirements.txt --target "${LAMBDA_TASK_ROOT}"

# Set the CMD to your handler (could also be done as a parameter override outside of the Dockerfile)
CMD [ "ragas_eval_function.lambda_handler" ]
