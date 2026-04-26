import { createSlice, PayloadAction } from '@reduxjs/toolkit';
import { OSProfile } from '../../types';
import { initialOSProfiles } from '../../data/initialData';

interface OSProfilesState {
  profiles: OSProfile[];
}

const initialState: OSProfilesState = {
  profiles: initialOSProfiles,
};

const osProfilesSlice = createSlice({
  name: 'osProfiles',
  initialState,
  reducers: {
    addProfile: (state, action: PayloadAction<OSProfile>) => {
      state.profiles.push(action.payload);
    },
    updateProfile: (state, action: PayloadAction<OSProfile>) => {
      const idx = state.profiles.findIndex(p => p.id === action.payload.id);
      if (idx !== -1) state.profiles[idx] = action.payload;
    },
    deleteProfile: (state, action: PayloadAction<string>) => {
      state.profiles = state.profiles.filter(p => p.id !== action.payload);
    },
  },
});

export const { addProfile, updateProfile, deleteProfile } = osProfilesSlice.actions;
export default osProfilesSlice.reducer;
