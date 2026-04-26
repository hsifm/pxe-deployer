import { createSlice, PayloadAction } from '@reduxjs/toolkit';
import { DeploymentConfig } from '../../types';
import { initialConfigurations } from '../../data/initialData';

interface ConfigurationsState {
  configs: DeploymentConfig[];
}

const initialState: ConfigurationsState = {
  configs: initialConfigurations,
};

const configurationsSlice = createSlice({
  name: 'configurations',
  initialState,
  reducers: {
    addConfig: (state, action: PayloadAction<DeploymentConfig>) => {
      state.configs.push(action.payload);
    },
    updateConfig: (state, action: PayloadAction<DeploymentConfig>) => {
      const idx = state.configs.findIndex(c => c.id === action.payload.id);
      if (idx !== -1) state.configs[idx] = action.payload;
    },
    deleteConfig: (state, action: PayloadAction<string>) => {
      state.configs = state.configs.filter(c => c.id !== action.payload);
    },
    setDefault: (state, action: PayloadAction<{ configId: string; osProfileId: string }>) => {
      state.configs
        .filter(c => c.osProfileId === action.payload.osProfileId)
        .forEach(c => { c.isDefault = c.id === action.payload.configId; });
    },
  },
});

export const { addConfig, updateConfig, deleteConfig, setDefault } = configurationsSlice.actions;
export default configurationsSlice.reducer;
