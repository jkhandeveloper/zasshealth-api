import {
  Global,
  Injectable,
  Module,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { PrismaClient, Prisma } from '@prisma/client';
@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  async onModuleInit() {
    await this.$connect();
  }
  async onModuleDestroy() {
    await this.$disconnect();
  }
  // Every schedule mutation and booking locks the same doctor row before reading.
  async lockDoctor(tx: Prisma.TransactionClient, doctorId: string) {
    await tx.$queryRaw`SELECT id FROM "DoctorProfile" WHERE id = CAST(${doctorId} AS uuid) FOR UPDATE`;
  }
}
@Global()
@Module({ providers: [PrismaService], exports: [PrismaService] })
export class PrismaModule {}
