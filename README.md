# Person Service

A high-performance AWS Serverless API for managing person records, built with **AWS CDK**, **TypeScript**, and **Fastify**.

## 🚀 Tech Stack

-   **Framework**: [AWS CDK](https://aws.amazon.com/cdk/) (v2)
-   **Runtime**: [Node.js 20.x](https://nodejs.org/)
-   **Web Framework**: [Fastify](https://www.fastify.io/) (utilizing [@fastify/aws-lambda](https://github.com/fastify/aws-lambda))
-   **Database**: [Amazon DynamoDB](https://aws.amazon.com/dynamodb/) (Single Table Design)
-   **Messaging**: [Amazon SNS](https://aws.amazon.com/sns/) (Event-driven architecture)
-   **Observability**: [AWS Lambda Powertools](https://awslabs.github.io/aws-lambda-powertools-typescript/) (Logger, Metrics, Tracer)
-   **Testing**: [Vitest](https://vitest.dev/) & [aws-sdk-client-mock](https://github.com/m-radzikowski/aws-sdk-client-mock)
-   **Development**: [esbuild](https://esbuild.github.io/) (Local bundling)

## 🛠 Prerequisites

-   **Node.js**: v20 or higher
-   **AWS CLI**: Configured with appropriate credentials
-   **CDK CLI**: AWS CDK Toolkit installed (`npm install -g aws-cdk`)
-   **AWS Account**: Bootstrapped for CDK (`npx cdk bootstrap`)

## 📦 Installation & Local Development

1.  **Clone the repository**
2.  **Install dependencies**:
    ```bash
    npm install
    ```
3.  **Run Unit Tests**:
    ```bash
    npm test
    ```
4.  **Run Tests in Watch Mode**:
    ```bash
    npm run test:watch
    ```

## 📜 API Reference

The API is deployed using a `$default` stage.

### Create Person
-   **Method**: `POST`
-   **Path**: `/person`
-   **Request Body**:
    ```json
    {
      "firstName": "String",
      "lastName": "String",
      "phoneNumber": "String (min 10 chars)",
      "address": "String (min 5 chars)"
    }
    ```
-   **Success Response**: `201 Created`

### List Persons (Paginated)
-   **Method**: `GET`
-   **Path**: `/person`
-   **Query Parameters**:
    -   `limit` (optional): Number of records to return (1-100, default 30)
    -   `cursor` (optional): Base64 encoded pagination token
-   **Success Response**: `200 OK`
-   **Response Body**:
    ```json
    {
      "items": [...],
      "nextCursor": "Base64Token or null",
      "count": 10
    }
    ```

## 🚢 Deployment

The project supports multiple environments (Stage and Prod).

### Manual Deployment
```bash
# Deploy to Stage environment (Default)
npx cdk deploy PersonServiceStack-stage

# Deploy to Prod environment
npx cdk deploy PersonServiceStack-prod
```

### Useful Infrastructure Commands
-   `npx cdk diff`: Compare local changes with the deployed environment.
-   `npx cdk synth`: Emit the synthesized CloudFormation template.

## 📊 Observability

This service uses **AWS X-Ray** for distributed tracing and **CloudWatch Metrics** for operational insights via Lambda Powertools.
-   **Annotations**: All traces are annotated with `personId` for easy filtering.
-   **Metrics**: Custom metrics like `PersonCreated` and `PersonsListed` are published automatically.
