import {
  IsString,
  IsOptional,
  IsBoolean,
  IsArray,
  ArrayMinSize,
  IsUUID,
  IsIn,
  IsNotEmpty,
} from 'class-validator';

export class CreateLabTestDto {
  @IsString()
  @IsNotEmpty()
  code!: string;

  @IsString()
  @IsNotEmpty()
  name!: string;

  @IsOptional()
  @IsString()
  nameAr?: string;

  @IsOptional()
  @IsString()
  unit?: string;

  @IsOptional()
  @IsString()
  referenceRange?: string;
}

export class UpdateLabTestDto {
  @IsOptional()
  @IsString()
  code?: string;

  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  nameAr?: string;

  @IsOptional()
  @IsString()
  unit?: string;

  @IsOptional()
  @IsString()
  referenceRange?: string;

  @IsOptional()
  @IsBoolean()
  active?: boolean;
}

export class BookLabOrderDto {
  @IsUUID()
  @IsNotEmpty()
  patientId!: string;

  @IsArray()
  @ArrayMinSize(1)
  @IsUUID('4', { each: true })
  testIds!: string[];
}

export class EnterResultDto {
  @IsString()
  @IsNotEmpty()
  resultValue!: string;

  @IsOptional()
  @IsIn(['NORMAL', 'HIGH', 'LOW'])
  flag?: 'NORMAL' | 'HIGH' | 'LOW';
}
