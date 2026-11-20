import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';

export enum SagaStatus {
  STARTED = 'STARTED',
  IN_PROGRESS = 'IN_PROGRESS',
  COMPENSATING = 'COMPENSATING',
  COMPENSATED = 'COMPENSATED',
  COMPLETED = 'COMPLETED',
  FAILED = 'FAILED',
}

export enum SagaType {
  INBOUND = 'INBOUND',
  OUTBOUND = 'OUTBOUND',
  TRANSFER = 'TRANSFER',
  ADJUSTMENT = 'ADJUSTMENT',
}

export interface SagaStepLog {
  step: string;
  action: string;
  status: 'PENDING' | 'SUCCESS' | 'FAILED' | 'COMPENSATED';
  timestamp: string;
  detail?: any;
}

@Entity('saga_instances')
export class SagaInstance {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  transactionId: string;

  @Column({
    type: 'enum',
    enum: SagaType,
  })
  sagaType: SagaType;

  @Column({
    type: 'enum',
    enum: SagaStatus,
    default: SagaStatus.IN_PROGRESS,
  })
  status: SagaStatus;

  @Column()
  currentStep: string;

  @Column({ type: 'jsonb' })
  payload: any;

  @Column({ type: 'jsonb' })
  stepLogs: SagaStepLog[];

  @Column({ type: 'text', nullable: true })
  errorMessage?: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
