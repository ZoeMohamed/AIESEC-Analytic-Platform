import { defineEventHandler } from 'h3'

const PROGRAMMES = [
  { id: '7', label: 'GV (Global Volunteer)', shortName: 'GV' },
  { id: '8', label: 'GTa (Global Talent - Academic)', shortName: 'GTa' },
  { id: '9', label: 'GTe (Global Talent - Entrepreneur)', shortName: 'GTe' },
]

export default defineEventHandler(() => {
  return {
    programmes: PROGRAMMES,
  }
})
