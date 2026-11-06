import { Module } from '@nestjs/common';
import { JustificationsController } from './justifications.controller';
import { JustificationsService } from './justifications.service';

@Module({ controllers: [JustificationsController], providers: [JustificationsService] })
export class JustificationsModule {}
