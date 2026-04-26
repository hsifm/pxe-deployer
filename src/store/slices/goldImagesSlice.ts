import { createSlice, PayloadAction } from '@reduxjs/toolkit';
import { GoldImage } from '../../types';
import { initialGoldImages } from '../../data/initialData';

interface GoldImagesState {
  images: GoldImage[];
}

const initialState: GoldImagesState = {
  images: initialGoldImages,
};

const goldImagesSlice = createSlice({
  name: 'goldImages',
  initialState,
  reducers: {
    addGoldImage: (state, action: PayloadAction<GoldImage>) => {
      state.images.push(action.payload);
    },
    updateGoldImage: (state, action: PayloadAction<GoldImage>) => {
      const idx = state.images.findIndex(g => g.id === action.payload.id);
      if (idx !== -1) state.images[idx] = action.payload;
    },
    deleteGoldImage: (state, action: PayloadAction<string>) => {
      state.images = state.images.filter(g => g.id !== action.payload);
    },
  },
});

export const { addGoldImage, updateGoldImage, deleteGoldImage } = goldImagesSlice.actions;
export default goldImagesSlice.reducer;
