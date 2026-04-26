import { createSlice, PayloadAction } from '@reduxjs/toolkit';
import { InfraSettings } from '../../types';
import { initialInfraSettings } from '../../data/initialData';

const settingsSlice = createSlice({
  name: 'settings',
  initialState: initialInfraSettings,
  reducers: {
    updateSettings: (state, action: PayloadAction<Partial<InfraSettings>>) => {
      return { ...state, ...action.payload };
    },
  },
});

export const { updateSettings } = settingsSlice.actions;
export default settingsSlice.reducer;
