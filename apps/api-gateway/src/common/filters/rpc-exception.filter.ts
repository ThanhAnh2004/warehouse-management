import { Catch, ExceptionFilter, ArgumentsHost, HttpException, HttpStatus } from '@nestjs/common';
import { RpcException } from '@nestjs/microservices';

@Catch()
export class RpcExceptionToHttpFilter implements ExceptionFilter {
  catch(exception: any, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse();

    // Nếu bản thân lỗi đã là HTTP Exception (như từ ValidationPipe, Guard) -> Bỏ qua
    if (exception instanceof HttpException) {
      return response.status(exception.getStatus()).json(exception.getResponse());
    }

    // Xử lý lỗi ném ra từ Microservice (Identity Service trả về qua TCP)
    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let message = 'Internal server error from microservice';

    if (exception instanceof RpcException) {
      const rpcError = exception.getError() as any;
      status = rpcError.status || HttpStatus.BAD_REQUEST;
      message = rpcError.message || rpcError;
    } else if (exception && exception.message) {
      // Bắt các error object thông thường được forward qua mạng
      message = exception.message;
      if (exception.message.includes('exists') || exception.message.includes('Conflict')) {
        status = HttpStatus.CONFLICT;
      } else if (exception.message.includes('Invalid') || exception.message.includes('fail')) {
        status = HttpStatus.BAD_REQUEST;
      }
    }

    response.status(status).json({
      statusCode: status,
      message,
      timestamp: new Date().toISOString(),
    });
  }
}
