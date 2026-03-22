import { Logger } from '@aws-lambda-powertools/logger';
import { Metrics } from '@aws-lambda-powertools/metrics';
import { Tracer } from '@aws-lambda-powertools/tracer';

const serviceName = process.env.POWERTOOLS_SERVICE_NAME || 'PersonService';
const namespace = process.env.POWERTOOLS_METRICS_NAMESPACE || 'PersonServiceNamespace';

export const logger = new Logger({ serviceName });
export const metrics = new Metrics({ namespace, serviceName });
export const tracer = new Tracer({ serviceName });
