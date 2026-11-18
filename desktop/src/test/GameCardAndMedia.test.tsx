import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { GameCard } from '../components/GameCard.tsx';
import { CustomImageViewer } from '../components/CustomImageViewer.tsx';
import { CustomVideoPlayer } from '../components/CustomVideoPlayer.tsx';
import { CaptureViewerModal } from '../components/CaptureViewerModal.tsx';
import { CaptureItem, Game } from '../types/api.ts';

const mockGameSSD: Game = {
  app_id: 105600,
  name: 'Terraria',
  install_dir: 'Terraria',
  size_bytes: 536870912,
  state: 'active_ssd',
  current_library_id: 'ssd0',
  build_id: '12345',
  last_backup_time: null,
  backup_clean: false,
  is_pinned: false,
};

const mockGameHDD: Game = {
  app_id: 1145360,
  name: 'Hades',
  install_dir: 'Hades',
  size_bytes: 10737418240,
  state: 'storage_hdd',
  current_library_id: 'hdd0',
  build_id: '67890',
  last_backup_time: null,
  backup_clean: true,
  is_pinned: true,
};

describe('GameCard & Custom Media Components', () => {
  it('renders Play button on SSD game card and calls onLaunch', () => {
    const onLaunchMock = vi.fn();
    const onActionMock = vi.fn();
    render(
      <GameCard
        game={mockGameSSD}
        onLaunch={onLaunchMock}
        onAction={onActionMock}
      />
    );

    const playBtn = screen.getByRole('button', { name: /Play/i });
    expect(playBtn).toBeInTheDocument();
    fireEvent.click(playBtn);
    expect(onLaunchMock).toHaveBeenCalledWith(mockGameSSD);
    expect(onActionMock).not.toHaveBeenCalled();
  });

  it('renders Move to SSD on HDD game card and calls onAction promote', () => {
    const onActionMock = vi.fn();
    render(
      <GameCard
        game={mockGameHDD}
        onAction={onActionMock}
      />
    );

    const moveBtn = screen.getByRole('button', { name: /Move to SSD/i });
    expect(moveBtn).toBeInTheDocument();
    fireEvent.click(moveBtn);
    expect(onActionMock).toHaveBeenCalledWith(mockGameHDD, 'promote');
  });

  it('toggles pin status when clicking the pin overlay button', () => {
    const onTogglePinMock = vi.fn();
    render(
      <GameCard
        game={mockGameSSD}
        onTogglePin={onTogglePinMock}
      />
    );

    const pinBtn = screen.getByTestId('game-pin-btn');
    expect(pinBtn).toBeInTheDocument();
    fireEvent.click(pinBtn);
    expect(onTogglePinMock).toHaveBeenCalledWith(mockGameSSD);
  });

  it('renders CustomImageViewer and zooms in and out', () => {
    render(
      <CustomImageViewer
        src="blob:http://localhost/test.png"
        alt="Test Screenshot"
      />
    );

    expect(screen.getByTestId('custom-image-viewer')).toBeInTheDocument();
    expect(screen.getByText('100%')).toBeInTheDocument();

    const zoomInBtn = screen.getByLabelText('Zoom in');
    fireEvent.click(zoomInBtn);
    expect(screen.getByText('125%')).toBeInTheDocument();

    const zoomOutBtn = screen.getByLabelText('Zoom out');
    fireEvent.click(zoomOutBtn);
    expect(screen.getByText('100%')).toBeInTheDocument();
  });

  it('renders CustomVideoPlayer with ±5s jump buttons and trim mode toggle', () => {
    render(
      <CustomVideoPlayer
        src="http://localhost:8765/captures/test.mp4"
        autoPlay={false}
      />
    );

    expect(screen.getByTestId('custom-video-player')).toBeInTheDocument();
    expect(screen.getByLabelText('Skip backward 5 seconds')).toBeInTheDocument();
    expect(screen.getByLabelText('Skip forward 5 seconds')).toBeInTheDocument();

    const trimBtn = screen.getByLabelText('Toggle clip trimming');
    expect(trimBtn).toBeInTheDocument();
    fireEvent.click(trimBtn);
    expect(screen.getByText('Trimming')).toBeInTheDocument();
  });

  it('navigates with previous and next buttons inside CustomImageViewer controls', () => {
    const onPrevMock = vi.fn();
    const onNextMock = vi.fn();
    render(
      <CustomImageViewer
        src="blob:http://localhost/test.png"
        alt="Test Screenshot"
        onPrevious={onPrevMock}
        onNext={onNextMock}
        hasPrevious={true}
        hasNext={true}
      />
    );

    const prevBtn = screen.getByRole('button', { name: 'Previous image' });
    const nextBtn = screen.getByRole('button', { name: 'Next image' });
    expect(prevBtn).toBeInTheDocument();
    expect(nextBtn).toBeInTheDocument();

    fireEvent.click(prevBtn);
    expect(onPrevMock).toHaveBeenCalledTimes(1);

    fireEvent.click(nextBtn);
    expect(onNextMock).toHaveBeenCalledTimes(1);
  });

  it('renders CaptureViewerModal with SVG icon badge, clean header, and toggles details', () => {
    const mockItems: CaptureItem[] = [
      {
        id: 'cap1',
        filename: 'Terraria_BossFight.png',
        mime_type: 'image/png',
        kind: 'image',
        source: 'sharex',
        matched_by: 'sharex_history',
        size_bytes: 2048000,
        captured_at: '2026-11-18T10:00:00Z',
        window_title: 'Terraria: Journey’s End',
        process_name: 'Terraria.exe',
      },
    ];

    render(
      <CaptureViewerModal
        open={true}
        items={mockItems}
        currentIndex={0}
        onSelectIndex={vi.fn()}
        onClose={vi.fn()}
        onCopyImage={vi.fn()}
        copyingId={null}
        copiedId={null}
      />
    );

    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText('Terraria_BossFight.png')).toBeInTheDocument();
    expect(screen.getByText('ShareX')).toBeInTheDocument();
    expect(screen.getByText('1 / 1')).toBeInTheDocument();

    // Toggle details button
    const detailsBtn = screen.getByRole('button', { name: /capture details/i });
    expect(detailsBtn).toBeInTheDocument();
    fireEvent.click(detailsBtn);
    expect(screen.getByText(/Window:/)).toBeInTheDocument();
    expect(screen.getByText('Terraria: Journey’s End')).toBeInTheDocument();
  });
});
