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

  @MessagePattern('roles.findAll')
  handleFindAllRoles() {
    return this.usersService.getRoles();
  }

  @MessagePattern('roles.update')
  handleUpdateRole(@Payload() data: { name: string; updateData: { permissions?: string[]; description?: string } }) {
    return this.usersService.updateRole(data.name, data.updateData);
  }

  @MessagePattern('permissions.findAll')
  handleFindAllPermissions() {
    return this.usersService.getPermissions();
  }

  @MessagePattern('roles.create')
  handleCreateRole(@Payload() data: { name: string; description?: string }) {
    return this.usersService.createRole(data);
  }

  @MessagePattern('roles.delete')
  handleDeleteRole(@Payload() data: { name: string }) {
    return this.usersService.deleteRole(data.name);
  }
}
