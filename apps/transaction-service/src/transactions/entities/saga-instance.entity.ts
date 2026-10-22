import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, Index } from 'typeorm';

export enum SagaType {
  TRANSFER = 'TRANSFER',
  OUTBOUND = 'OUTBOUND',
  INBOUND = 'INBOUND',
  ADJUSTMENT = 'ADJUSTMENT',
}

export enum SagaStatus {
  STARTED = 'STARTED',
  IN_PROGRESS = 'IN_PROGRESS',
  COMPENSATING = 'COMPENSATING',
  COMPENSATED = 'COMPENSATED',
  COMPLETED = 'COMPLETED',
  FAILED = 'FAILED',
}

export interface SagaStepLog {
  step: string;
  action: string;
  status: 'PENDING' | 'SUCCESS' | 'FAILED' | 'COMPENSATED';
  payload?: any;
  error?: string;
  timestamp: string;
}

@Entity('saga_instances')
@Index(['transactionId'])
@Index(['status'])
@Index(['createdAt'])
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
    default: SagaStatus.STARTED,
  })
  status: SagaStatus;

  @Column({ default: 'INITIAL' })
  currentStep: string;

  @Column({ type: 'jsonb', nullable: true })
  payload: any;

  @Column({ type: 'jsonb', default: [] })
  stepLogs: SagaStepLog[];

  @Column({ type: 'text', nullable: true })
  errorMessage: string;

  @Column({ type: 'int', default: 0 })
  retryCount: number;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
