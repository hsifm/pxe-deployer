import { createSlice, PayloadAction } from '@reduxjs/toolkit';
import { PackageFile } from '../../types';

interface PackageFilesState {
  files: PackageFile[];
}

const initialState: PackageFilesState = {
  files: [],
};

const packageFilesSlice = createSlice({
  name: 'packageFiles',
  initialState,
  reducers: {
    addPackageFile: (state, action: PayloadAction<PackageFile>) => {
      state.files.push(action.payload);
    },
    updatePackageFile: (state, action: PayloadAction<PackageFile>) => {
      const idx = state.files.findIndex(f => f.id === action.payload.id);
      if (idx !== -1) state.files[idx] = action.payload;
    },
    deletePackageFile: (state, action: PayloadAction<string>) => {
      state.files = state.files.filter(f => f.id !== action.payload);
    },
  },
});

export const { addPackageFile, updatePackageFile, deletePackageFile } = packageFilesSlice.actions;
export default packageFilesSlice.reducer;
