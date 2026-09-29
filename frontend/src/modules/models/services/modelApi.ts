import { createCrudApi } from '@/shared/services/crudApi';
import type { DeviceModel, DeviceModelRequest } from '../types';

export const MODELS_KEY = 'models';
export const modelApi = createCrudApi<DeviceModel, DeviceModelRequest>('/models');
