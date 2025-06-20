import { computed } from 'mobx';
import { observer } from 'mobx-react-lite';
import React, {
  ForwardedRef,
  ReactElement,
  useCallback,
  useId,
  useMemo,
  useRef,
  useState,
} from 'react';

import { Grid, GridCell, IconButton, IconSet, Row, Tag } from 'widgets';
import { RowProps, useGridFocus } from 'widgets/combobox/Grid';
import { Flyout } from 'widgets/popovers';
import { useStore } from '../contexts/StoreContext';
import { ClientTag } from '../entities/Tag';
import { useComputed } from '../hooks/mobx';

export interface TagSelectorProps {
  selection: ClientTag[];
  onSelect: (item: ClientTag) => void;
  onDeselect: (item: ClientTag) => void;
  onTagClick?: (item: ClientTag) => void;
  onClear: () => void;
  disabled?: boolean;
  extraIconButtons?: ReactElement;
  renderCreateOption?: (
    inputText: string,
    resetTextBox: () => void,
  ) => ReactElement<RowProps> | ReactElement<RowProps>[];
  multiline?: boolean;
  showTagContextMenu?: (e: React.MouseEvent<HTMLElement>, tag: ClientTag) => void;
}

const TagSelector = (props: TagSelectorProps) => {
  const {
    selection,
    onSelect,
    onDeselect,
    onTagClick,
    showTagContextMenu,
    onClear,
    disabled,
    extraIconButtons,
    renderCreateOption,
    multiline,
  } = props;
  const gridId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState('');

  const handleChange = useRef((e: React.ChangeEvent<HTMLInputElement>) => {
    setIsOpen(true);
    setQuery(e.target.value);
  }).current;

  const clearSelection = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      setQuery('');
      onClear();
    },
    [onClear],
  );

  const isInputEmpty = query.length === 0;

  const gridRef = useRef<HTMLDivElement>(null);
  const [activeDescendant, handleGridFocus] = useGridFocus(gridRef);
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Backspace') {
        e.stopPropagation();

        // Remove last item from selection with backspace
        if (isInputEmpty && selection.length > 0) {
          onDeselect(selection[selection.length - 1]);
        }
      } else if (e.key === 'Escape') {
        e.preventDefault();
        setQuery('');
        setIsOpen(false);
      } else {
        handleGridFocus(e);
      }
    },
    [handleGridFocus, onDeselect, isInputEmpty, selection],
  );

  const handleBlur = useRef((e: React.FocusEvent<HTMLDivElement>) => {
    // If anything is blurred, and the new focus is not the input nor the flyout, close the flyout
    const isFocusingOption =
      e.relatedTarget instanceof HTMLElement && e.relatedTarget.matches('div[role="row"]');
    if (isFocusingOption || e.relatedTarget === inputRef.current) {
      return;
    }
    setQuery('');
    setIsOpen(false);
  }).current;

  const handleFocus = useRef(() => setIsOpen(true)).current;

  const handleBackgroundClick = useCallback(() => inputRef.current?.focus(), []);

  const resetTextBox = useRef(() => {
    inputRef.current?.focus();
    setQuery('');
  });

  const toggleSelection = useCallback(
    (isSelected: boolean, tag: ClientTag) => {
      if (!isSelected) {
        onSelect(tag);
      } else {
        onDeselect(tag);
      }
      resetTextBox.current();
    },
    [onDeselect, onSelect],
  );

  return (
    <div
      role="combobox"
      aria-expanded={isOpen}
      aria-haspopup="grid"
      aria-owns={gridId}
      className={`input multiautocomplete tag-selector ${multiline ? 'multiline' : ''}`}
      onBlur={handleBlur}
      onClick={handleBackgroundClick}
    >
      <Flyout
        isOpen={isOpen}
        cancel={() => setIsOpen(false)}
        placement="bottom-start"
        ignoreCloseForElementOnBlur={inputRef.current || undefined}
        target={(ref) => (
          <div ref={ref} className="multiautocomplete-input">
            <div className="input-wrapper">
              {selection.map((t) => (
                <SelectedTag
                  key={t.id}
                  tag={t}
                  onDeselect={onDeselect}
                  onTagClick={onTagClick}
                  showContextMenu={showTagContextMenu}
                />
              ))}
              <input
                disabled={disabled}
                type="text"
                value={query}
                aria-autocomplete="list"
                onChange={handleChange}
                onKeyDown={handleKeyDown}
                aria-controls={gridId}
                aria-activedescendant={activeDescendant}
                ref={inputRef}
                onFocus={handleFocus}
              />
            </div>
            {extraIconButtons}
            <IconButton icon={IconSet.CLOSE} text="Clear" onClick={clearSelection} />
          </div>
        )}
      >
        <SuggestedTagsList
          ref={gridRef}
          id={gridId}
          query={query}
          selection={selection}
          toggleSelection={toggleSelection}
          resetTextBox={resetTextBox.current}
          renderCreateOption={renderCreateOption}
        />
      </Flyout>
    </div>
  );
};

export { TagSelector };

interface SelectedTagProps {
  tag: ClientTag;
  onDeselect: (item: ClientTag) => void;
  onTagClick?: (item: ClientTag) => void;
  showContextMenu?: (e: React.MouseEvent<HTMLElement>, item: ClientTag) => void;
}

const SelectedTag = observer((props: SelectedTagProps) => {
  const { tag, onDeselect, onTagClick, showContextMenu } = props;
  return (
    <Tag
      text={tag.name}
      color={tag.viewColor}
      onRemove={() => onDeselect(tag)}
      onClick={onTagClick !== undefined ? () => onTagClick(tag) : undefined}
      onContextMenu={showContextMenu !== undefined ? (e) => showContextMenu(e, tag) : undefined}
    />
  );
});

interface SuggestedTagsListProps {
  id: string;
  query: string;
  selection: readonly ClientTag[];
  toggleSelection: (isSelected: boolean, tag: ClientTag) => void;
  resetTextBox: () => void;
  renderCreateOption?: (
    inputText: string,
    resetTextBox: () => void,
  ) => ReactElement<RowProps> | ReactElement<RowProps>[];
}

const SuggestedTagsList = observer(
  React.forwardRef(function TagsList(
    props: SuggestedTagsListProps,
    ref: ForwardedRef<HTMLDivElement>,
  ) {
    const { id, query, selection, toggleSelection, resetTextBox, renderCreateOption } = props;

    // 记忆最近使用的标签，第5步：右侧栏标签输入框修改 useStore() 存储
    const { tagStore, uiStore } = useStore();

    // 记忆最近使用的标签，第5.1步：右侧栏标签输入框修改标签列表排序，改为最近使用的标签优先排序（上方为原始代码）
    const suggestions = useMemo(
      () =>
        computed(() => {
          let list: ClientTag[];
          if (query.length === 0) {
            list = tagStore.tagList.slice();
          } else {
            const textLower = query.toLowerCase();
            list = tagStore.tagList.filter((t) => t.name.toLowerCase().includes(textLower));
          }
          // recentTags 排序
          const recentIds = uiStore.recentTags;
          list.sort((a, b) => {
            const ia = recentIds.indexOf(a.id);
            const ib = recentIds.indexOf(b.id);
            if (ia === -1 && ib === -1) return 0;
            if (ia === -1) return 1;
            if (ib === -1) return -1;
            return ia - ib;
          });
          return list;
        }),
      [query, tagStore, uiStore.recentTags],
    ).get();

    return (
      <Grid ref={ref} id={id} multiselectable>
        {suggestions.map((tag) => {
          const selected = selection.includes(tag);
          return (
            <TagOption
              id={`${id}${tag.id}`}
              key={tag.id}
              tag={tag}
              selected={selected}
              toggleSelection={toggleSelection}
            />
          );
        })}
        {suggestions.length === 0 && renderCreateOption?.(query, resetTextBox)}
      </Grid>
    );
  }),
);

interface TagOptionProps {
  id?: string;
  tag: ClientTag;
  selected?: boolean;
  toggleSelection: (isSelected: boolean, tag: ClientTag) => void;
}

export const TagOption = observer(({ id, tag, selected, toggleSelection }: TagOptionProps) => {
  const [path, hint] = useComputed(() => {
    const path = tag.path.join(' › ');
    const hint = path.slice(0, Math.max(0, path.length - tag.name.length - 3));
    return [path, hint];
  }).get();

  return (
    <Row
      id={id}
      value={tag.name}
      selected={selected}
      icon={<span style={{ color: tag.viewColor }}>{IconSet.TAG}</span>}
      onClick={() => toggleSelection(selected ?? false, tag)}
      tooltip={path}
    >
      {hint.length > 0 ? <GridCell className="tag-option-hint">{hint}</GridCell> : <GridCell />}
    </Row>
  );
});
