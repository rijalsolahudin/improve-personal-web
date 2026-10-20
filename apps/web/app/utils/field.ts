import type { InjectionKey } from 'vue'

/** Id kontrol yang dibagikan `Field` ke `Input` di dalamnya, supaya `<label for>` selalu cocok. */
export const FIELD_ID_KEY: InjectionKey<string> = Symbol('field-id')
