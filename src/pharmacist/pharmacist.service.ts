import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { PageDto } from '../common/dto';
import { CreateBillDto, DeliveryDto, PaymentDto } from './pharmacist.dto';
@Injectable()
export class PharmacistService {
  constructor(private db: PrismaService) {}
  async create(userId: string, dto: CreateBillDto) {
    const pharmacist = await this.db.pharmacistProfile.findUnique({
      where: { userId },
    });
    if (!pharmacist)
      throw new NotFoundException('Pharmacist profile not found');
    const totalAmount = dto.items.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0);
    return this.db.bill.create({
      data: {
        patientName: dto.patientName,
        totalAmount,
        paymentMethod: dto.paymentMethod,
        pharmacistId: pharmacist.id,
        items: { create: dto.items.map((item) => ({ name: item.name.trim(), quantity: item.quantity, unitPrice: item.unitPrice })) },
      },
      include: { items: true },
    });
  }
  async update(userId: string, id: string, dto: PaymentDto | DeliveryDto) {
    return this.db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "Bill" WHERE id = CAST(${id} AS uuid) FOR UPDATE`;
      const bill = await tx.bill.findFirst({
        where: { id, pharmacist: { userId } },
      });
      if (!bill) throw new NotFoundException('Bill not found');
      if (
        'paymentStatus' in dto &&
        bill.paymentStatus === 'PAID' &&
        dto.paymentStatus !== 'PAID'
      )
        throw new ConflictException('A paid bill cannot be reverted');
      if ('deliveryStatus' in dto) {
        const states = ['PENDING', 'OUT_FOR_DELIVERY', 'DELIVERED'];
        const change =
          states.indexOf(dto.deliveryStatus) -
          states.indexOf(bill.deliveryStatus);
        if (change < 0 || change > 1)
          throw new ConflictException('Invalid delivery transition');
      }
      return tx.bill.update({ where: { id }, data: dto });
    });
  }
  list(userId: string, page: PageDto) {
    return this.db.bill.findMany({
      where: { pharmacist: { userId } },
      include: { items: true },
      skip: page.offset,
      take: page.limit,
      orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
    });
  }
}
