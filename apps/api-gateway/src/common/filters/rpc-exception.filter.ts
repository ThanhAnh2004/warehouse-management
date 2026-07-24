import { ExceptionFilter, Catch, ArgumentsHost, HttpStatus, Logger } from '@nestjs/common';
import { Response } from 'express';

@Catch()
export class RpcExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(RpcExceptionFilter.name);

  catch(exception: any, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();

    const errorMsg = exception?.message || exception?.detail || 'An unexpected microservice error occurred';
    const isRmqError =
      errorMsg.includes('ECONNREFUSED') ||
      errorMsg.includes('TimeoutError') ||
      errorMsg.includes('Connection to transport failed') ||
      errorMsg.includes('There is no matching event handler') ||
      exception?.name === 'TimeoutError';

    this.logger.error(`Message Bus Exception Caught: ${errorMsg}`, exception?.stack);

    if (isRmqError) {
      return response.status(HttpStatus.SERVICE_UNAVAILABLE).json({
        statusCode: HttpStatus.SERVICE_UNAVAILABLE,
        error: 'Service Unavailable',
        message: 'Message Bus or target Microservice is currently unavailable or restarting.',
        detail: errorMsg,
        timestamp: new Date().toISOString(),
      });
    }

    const status = exception?.status || exception?.statusCode || HttpStatus.INTERNAL_SERVER_ERROR;
    return response.status(status).json({
      statusCode: status,
      message: errorMsg,
      timestamp: new Date().toISOString(),
    });
  }
}

export { RpcExceptionFilter as RpcExceptionToHttpFilter };

