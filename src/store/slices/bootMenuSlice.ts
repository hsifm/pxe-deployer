import { createSlice, PayloadAction } from '@reduxjs/toolkit';
import { BootMenuEntry } from '../../types';
import { initialBootMenuEntries } from '../../data/initialData';

interface BootMenuState {
  entries: BootMenuEntry[];
}

const initialState: BootMenuState = {
  entries: initialBootMenuEntries,
};

const bootMenuSlice = createSlice({
  name: 'bootMenu',
  initialState,
  reducers: {
    addEntry: (state, action: PayloadAction<BootMenuEntry>) => {
      state.entries.push(action.payload);
    },
    updateEntry: (state, action: PayloadAction<BootMenuEntry>) => {
      const idx = state.entries.findIndex(e => e.id === action.payload.id);
      if (idx !== -1) state.entries[idx] = action.payload;
    },
    deleteEntry: (state, action: PayloadAction<string>) => {
      state.entries = state.entries.filter(e => e.id !== action.payload);
    },
    reorderEntries: (state, action: PayloadAction<BootMenuEntry[]>) => {
      state.entries = action.payload;
    },
  },
});

export const { addEntry, updateEntry, deleteEntry, reorderEntries } = bootMenuSlice.actions;
export default bootMenuSlice.reducer;
