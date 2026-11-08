import { Module } from '@nestjs/common';
import { StaffUserRepository } from './application/ports/staff-user.repository';
import { UsersService } from './application/users.service';
import { UsersController } from './infrastructure/http/users.controller';
import { PrismaStaffUserRepository } from './infrastructure/persistence/prisma-staff-user.repository';

@Module({
  controllers: [UsersController],
  providers: [UsersService, { provide: StaffUserRepository, useClass: PrismaStaffUserRepository }],
})
export class UsersModule {}
