import { ExceptionFilter, Catch, ArgumentsHost, HttpStatus, Logger } from '@nestjs/common';
import { Response } from 'express';

@Catch()
export class RpcExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(RpcExceptionFilter.name);

  catch(exception: any, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();

    const rawErrorMsg =
      exception?.message ||
      exception?.error?.message ||
      exception?.detail ||
      (typeof exception === 'string' ? exception : 'An unexpected microservice error occurred');

    const isRmqError =
      rawErrorMsg.includes('ECONNREFUSED') ||
      rawErrorMsg.includes('TimeoutError') ||
      rawErrorMsg.includes('Connection to transport failed') ||
      rawErrorMsg.includes('There is no matching event handler') ||
      rawErrorMsg.includes('unexpected microservice error') ||
      exception?.name === 'TimeoutError';

    this.logger.error(`Message Bus Exception Caught: ${rawErrorMsg}`, exception?.stack);

    if (isRmqError) {
      return response.status(HttpStatus.SERVICE_UNAVAILABLE).json({
        statusCode: HttpStatus.SERVICE_UNAVAILABLE,
        error: 'Service Unavailable',
        message: 'Hệ thống Message Bus hoặc Dịch vụ Microservice xử lý hiện tạm thời không khả dụng. Vui lòng thử lại sau.',
        detail: rawErrorMsg,
        timestamp: new Date().toISOString(),
      });
    }

    const status = exception?.status || exception?.statusCode || HttpStatus.INTERNAL_SERVER_ERROR;
    const finalMessage =
      rawErrorMsg === 'An unexpected microservice error occurred'
        ? 'Dịch vụ Microservice xử lý không phản hồi hoặc đã xảy ra sự cố kết nối.'
        : rawErrorMsg;

    return response.status(status).json({
      statusCode: status,
      message: finalMessage,
      timestamp: new Date().toISOString(),
    });
  }
}

export { RpcExceptionFilter as RpcExceptionToHttpFilter };


