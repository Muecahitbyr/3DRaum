import type { ComponentType } from 'react';
import { FURNITURE_CATALOG, FURNITURE_COLORS } from '../../../config/furniture';
import type { FurnitureItem, FurnitureType } from '../../../types/furniture';
import { BathtubModel, ShowerModel, ToiletModel, WashbasinModel } from './models/BathModels';
import { BedModel } from './models/BedModel';
import { CabinetModel } from './models/CabinetModel';
import { ChairModel } from './models/ChairModel';
import { CoffeeTableModel } from './models/CoffeeTableModel';
import { PlantModel, RugModel } from './models/DecorModels';
import { DeskModel } from './models/DeskModel';
import {
  FridgeModel,
  KitchenBaseModel,
  KitchenIslandModel,
  KitchenSinkModel,
  KitchenStoveModel,
  KitchenTallModel,
  KitchenWallModel,
} from './models/KitchenModels';
import { LampModel } from './models/LampModel';
import { OfficeChairModel } from './models/OfficeChairModel';
import { ShelfModel } from './models/ShelfModel';
import { SofaModel } from './models/SofaModel';
import { TableModel } from './models/TableModel';
import type { FurnitureModelProps } from './models/types';
import { WardrobeModel } from './models/WardrobeModel';

const cabinet = (type: FurnitureType) => (props: FurnitureModelProps) => <CabinetModel {...props} type={type} />;
const lamp = (type: FurnitureType) => (props: FurnitureModelProps) => <LampModel {...props} type={type} />;

/** Prozedurales Modell je Typ – TypeScript erzwingt ein Modell für jeden Katalogeintrag. */
const PROCEDURAL_MODELS: Record<FurnitureType, ComponentType<FurnitureModelProps>> = {
  bed: BedModel,
  'double-bed': BedModel,
  wardrobe: WardrobeModel,
  dresser: cabinet('dresser'),
  nightstand: cabinet('nightstand'),
  sofa: SofaModel,
  armchair: (props) => <SofaModel {...props} fabric={FURNITURE_COLORS.armchairFabric} cushion={FURNITURE_COLORS.armchairCushion} />,
  'coffee-table': CoffeeTableModel,
  'tv-board': cabinet('tv-board'),
  shelf: ShelfModel,
  table: TableModel,
  chair: ChairModel,
  sideboard: cabinet('sideboard'),
  desk: DeskModel,
  'office-chair': OfficeChairModel,
  'ceiling-light': lamp('ceiling-light'),
  'pendant-light': lamp('pendant-light'),
  'floor-lamp': lamp('floor-lamp'),
  'table-lamp': lamp('table-lamp'),
  'kitchen-base': KitchenBaseModel,
  'kitchen-sink': KitchenSinkModel,
  'kitchen-stove': KitchenStoveModel,
  'kitchen-wall': KitchenWallModel,
  'kitchen-tall': KitchenTallModel,
  fridge: FridgeModel,
  'kitchen-island': KitchenIslandModel,
  toilet: ToiletModel,
  washbasin: WashbasinModel,
  shower: ShowerModel,
  bathtub: BathtubModel,
  rug: RugModel,
  plant: PlantModel,
};

/**
 * Wählt das 3D-Modell anhand der Modellquelle im Katalog. Echte GLB-Modelle
 * werden hier als weiterer Zweig ergänzt (auf die Außenmaße skaliert).
 */
export function FurnitureModel({ item }: { item: FurnitureItem }) {
  const source = FURNITURE_CATALOG[item.type].model;
  switch (source.kind) {
    case 'procedural': {
      const Model = PROCEDURAL_MODELS[item.type];
      return <Model width={item.width} depth={item.depth} height={item.height} colors={item.colors} light={item.light} />;
    }
  }
}
