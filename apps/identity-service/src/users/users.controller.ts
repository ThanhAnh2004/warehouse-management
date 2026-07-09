import { Controller } from '@nestjs/common';
import { UsersService } from './users.service';
import { MessagePattern, Payload } from '@nestjs/microservices';

@Controller()
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @MessagePattern('users.findAll')
  handleFindAll() {
    return this.usersService.findAll();
  }

  @MessagePattern('users.findOne')
  handleFindOne(@Payload() data: { id: string }) {
    return this.usersService.findOne(data.id);
  }

  @MessagePattern('users.update')
  handleUpdate(@Payload() data: { id: string; updateData: any }) {
    return this.usersService.update(data.id, data.updateData);
  }

  @MessagePattern('users.remove')
  handleRemove(@Payload() data: { id: string }) {
    return this.usersService.remove(data.id);
  }
}
